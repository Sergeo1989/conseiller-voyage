# Quickstart : Notifications et courriel transactionnel

**Branche** : `003-notifications-transactionnelles`
**Date** : 2026-05-26

Ce document décrit les scénarios End-to-End vérifiant que la feature
003 fonctionne. À exécuter à chaque étape majeure d'implémentation
(check intermédiaire) et systématiquement avant merge final.

---

## Pré-requis

- Branche `003-notifications-transactionnelles` checked out.
- Stack dev local démarrée : `docker compose up -d` (LocalStack SES,
  Postgres, Redis).
- `pnpm install` exécuté.
- Variables d'environnement dev configurées via 1Password CLI :
  - `DATABASE_URL` → Postgres local
  - `REDIS_URL` → Redis local
  - `AWS_REGION=ca-central-1`
  - `AWS_S3_ENDPOINT=http://localhost:4566` (LocalStack)
  - `AWS_SES_ENDPOINT=http://localhost:4566`
  - `NOTIFICATIONS_EMAIL_HASH_PEPPER` → secret dev (généré une fois,
    persisté dans `op://Conseiller Voyage Dev/notifications-pepper`)
  - `NOTIFICATIONS_SNS_HMAC_SECRET` → secret dev
- Migrations Prisma appliquées : `pnpm --filter @cv/db prisma migrate dev`

---

## Scénario 1 — Drainage outbox conformité bout en bout (US1 P1)

**But** : vérifier qu'une décision admin sur un dossier conformité
déclenche l'envoi d'un courriel délivré dans la boîte du conseiller.

**Étapes** :

1. Créer un conseiller test avec compte vérifié et MFA actif (réutiliser
   `scripts/seed-conseiller-test.ts` ou créer un via la console admin
   conformité — cohérent avec quickstart 001).
2. Soumettre un dossier conformité côté conseiller (POST
   `/me/submissions` avec payload valide).
3. Côté admin, approuver le dossier (POST
   `/admin/submissions/:id/approve`).
4. Observer la table `conformite_outbox` : un row apparaît avec
   `eventType = 'conformite.dossier_approved'`, `publishedAt = null`.
5. Attendre 5 s (cycle de drainage `OutboxPublisherJob` modifié).
6. Vérifier `conformite_outbox.publishedAt` non-null.
7. Vérifier `notification_email_log` : un row avec
   `correlationId = <conformite_outbox.id>`, `status = 'queued'` puis
   `'sent'` (worker dispatch ≤ 10 s).
8. Ouvrir l'UI MailHog/LocalStack (`http://localhost:8025`) et confirmer
   réception du courriel dans la boîte du conseiller test.
9. Vérifier que le contenu contient :
   - Sujet en FR-CA : « Votre dossier a été approuvé »
   - Numéro de certificat
   - Lien vers le tableau de bord conseiller
   - Footer Conseiller Voyage avec lien préférences (pas
     d'unsubscribe car transactionnel)

**Pass criteria** :
- ✅ Courriel reçu dans la boîte test
- ✅ Latence p95 dépôt outbox → reçu ≤ 30 s en dev local
- ✅ `notification_email_log.status` final : `sent` (LocalStack ne
  produit pas d'event Delivery — en prod ce serait `delivered`)
- ✅ Audit `notification_audit_entries` contient l'event `notification.dispatched`

---

## Scénario 2 — Drainage auth (signup conseiller) (US1 + US2 P1)

**But** : reproduire le flux inscription complet et vérifier que le
courriel verify-email arrive.

**Étapes** :

1. Vider les fichiers de test `db` : `pnpm --filter @cv/db
   prisma migrate reset --force`.
2. Re-applic migrations.
3. POST `/api/auth/signup` avec `{ email: "test+nouveau@example.com",
   password: "Test1234!" }`.
4. Observer `auth_outbox_emails` : nouveau row
   `eventType = 'auth.email_verification_requested'`.
5. Attendre 5 s.
6. Vérifier `notification_email_log` : status `sent`.
7. Ouvrir MailHog, récupérer le lien de vérification.
8. Cliquer le lien (ou GET la route).
9. Vérifier que le compte passe en `verified`.

**Pass criteria** :
- ✅ Courriel reçu avec lien valide 24 h
- ✅ Clic du lien vérifie le compte
- ✅ Locale FR-CA par défaut (header `Accept-Language` non précisé)
- ✅ `correlationId` traçable entre `auth_outbox_emails.id`,
  `notification_email_log.correlationId`, audit entry

---

## Scénario 3 — Idempotence (US1 P1)

**But** : un retry BullMQ ne produit pas de double envoi.

**Étapes** :

1. Provoquer un échec transient : couper LocalStack SES (`docker
   compose stop localstack`) puis envoyer un courriel via une action
   métier (signup ou approve).
2. Observer `notification_email_log.attempts = 1`, `lastError` non-null,
   `nextAttemptAt` défini.
3. Redémarrer LocalStack (`docker compose start localstack`).
4. Attendre le retry BullMQ.
5. Vérifier `notification_email_log.attempts = 2`, `status = 'sent'`,
   `sesMessageId` unique.
6. Compter les emails dans MailHog pour ce destinataire : **exactement 1**.

**Pass criteria** :
- ✅ 1 seul email envoyé malgré le retry
- ✅ `correlationId` unique
- ✅ Audit entry unique pour `notification.dispatched`

---

## Scénario 4 — Suppression list après hard bounce (US3 P2)

**But** : un hard bounce ajoute l'adresse en suppression list et bloque
les envois futurs.

**Étapes** :

1. Envoyer un courriel vers `bounce@simulator.amazonses.com` (adresse
   spéciale AWS qui produit toujours un hard bounce — utilisable
   uniquement en prod ou via mock LocalStack configuré).
2. **En dev** : simuler en POST manuel sur `/api/internal/notifications/sns`
   avec payload Bounce permanent signé HMAC :
   ```bash
   pnpm tsx scripts/dev/simulate-sns-bounce.ts \
     --email bounce@simulator.amazonses.com \
     --type permanent
   ```
3. Vérifier `notification_email_log.status = 'bounced'`,
   `bouncedAt` posé.
4. Vérifier `notification_suppression_list` : nouveau row avec
   `reason = 'hard_bounce'`, `expiresAt = null` (permanent).
5. Vérifier audit `notification.suppression.added_auto`.
6. Tenter un second envoi à cette adresse via un autre module
   (n'importe quelle action métier déclenchante).
7. Vérifier `notification_email_log` du second envoi :
   `status = 'skipped_suppressed'`, **pas** d'appel SES.
8. Vérifier audit `notification.dispatched` n'a PAS été émis pour ce
   second envoi (mais `notification.suppression_check_blocked` pourrait
   l'être en mode verbose).

**Pass criteria** :
- ✅ Suppression list contient l'adresse hashée
- ✅ Second envoi short-circuité avant SES
- ✅ Module source notifié via `send()` return value
  (`{ accepted: false, reason: 'suppressed' }`)

---

## Scénario 5 — Console admin : retrait manuel suppression (US6 P3)

**But** : un admin retire manuellement une adresse de la suppression
list après vérification d'un faux positif.

**Étapes** :

1. Admin se connecte à la console admin
   (`/fr/admin/notifications/suppression-list`).
2. La liste des suppressions affiche au moins une entrée.
3. Admin clique « Retirer » sur une entry.
4. Modal s'ouvre demandant un motif (champ texte obligatoire min 10
   caractères).
5. Admin saisit : « Faux positif vérifié — boîte mail réactivée
   après vérification téléphonique avec le destinataire. ».
6. Soumettre.
7. Vérifier `notification_suppression_list` : `removedAt` posé,
   `removedReason` enregistré, `removedByActorId = admin.id`.
8. Vérifier audit `notification.suppression.removed_manual` avec
   `actorId` et `reason`.
9. Tenter un nouvel envoi vers cette adresse via un module source.
10. Vérifier que l'envoi passe : `notification_email_log.status = 'sent'`.

**Pass criteria** :
- ✅ Motif < 10 caractères refusé (validation Zod côté serveur)
- ✅ Suppression list affiche l'entry retirée (filtré par défaut, ou
  visible avec filtre "include removed")
- ✅ Nouvel envoi passe (pas en `skipped_suppressed`)
- ✅ Audit trace complète

---

## Scénario 6 — Dead-letter + retry manuel (US6 P3)

**But** : un envoi qui échoue 5 fois est mis en dead-letter, et un
admin peut le relancer.

**Étapes** :

1. Forcer 5 échecs sur un envoi (ex: configurer un mock LocalStack qui
   renvoie 500 systématiquement pour le sender configuré, OU couper
   LocalStack 5 cycles de drainage de suite).
2. Vérifier `notification_email_log.status = 'dead_letter'`,
   `attempts = 5`, `failedAt` posé.
3. Vérifier alerte `notification.dead_lettered` émise (log structuré
   avec metric incrémentée).
4. Console admin `/fr/admin/notifications/dead-letter` : entry
   visible.
5. Admin clique « Relancer » avec motif : « Quota SES augmenté ce
   matin, problème root cause résolu. ».
6. Vérifier `notification_email_log.status = 'queued'`,
   `attempts = 0`, `nextAttemptAt = now()`.
7. Si LocalStack est sain : `status` passe à `sent` au prochain
   cycle.

**Pass criteria** :
- ✅ Dead-letter visible après 5 échecs
- ✅ Retry remet à zéro `attempts` et `nextAttemptAt`
- ✅ Audit `notification.dead_letter.retried_manual` avec motif
- ✅ Idempotency-Key required header refuse les replays

---

## Scénario 7 — Effacement Loi 25 d'un destinataire (US5 P2)

**But** : la routine d'effacement anonymise tous les courriels
historiques d'un destinataire.

**Étapes** :

1. Créer un conseiller test, lui envoyer 5 courriels variés
   (signup, MFA, dossier approuvé, rappel J-30, password reset).
2. Vérifier 5 entries dans `notification_email_log` pour cet
   `recipientEmailHashHMAC`, avec `recipientEmailClear`, `subject`,
   `htmlBody`, `textBody` populés.
3. Appeler la routine d'effacement (qui sera in fine consommée par
   feature 023, mais testable J1 via un endpoint interne ou un test
   d'intégration direct) :
   ```ts
   await eraseRecipientHistoryUseCase.execute({
     recipientEmailHashHMAC: '<hash>',
     reason: 'Demande Loi 25 du conseiller, ticket support #1234',
   });
   ```
4. Vérifier que les 5 entries ont : `recipientEmailClear = null`,
   `recipientEmailCanonical = null`, `subject = null`, `htmlBody = null`,
   `textBody = null`, `erasedAt = now()`.
5. Vérifier que `recipientEmailHashHMAC` est **conservé** (audit
   anti-resoumission).
6. Vérifier audit `notification.recipient_history.erased` avec
   `targetEmailHashHMAC = <hash>`, `metadata.entriesErased = 5`.
7. CHECK constraint Postgres vérifiée : insert manuel `erasedAt = now()`
   avec `recipientEmailClear` non-null doit échouer.

**Pass criteria** :
- ✅ Toutes les colonnes PII purgées
- ✅ `recipientEmailHashHMAC` conservé
- ✅ Audit trace complète
- ✅ CHECK constraint bloque les states invalides
- ✅ Temps < 60 secondes pour 5 entries (SC-008)

---

## Scénario 8 — Observabilité (US4 P2)

**But** : vérifier que les métriques OTel remontent dans Grafana et
que les alertes sont déclenchées au-delà des seuils.

**Étapes (manuelles côté ops)** :

1. Ouvrir Grafana Cloud Canada, dashboard `notifications`.
2. Vérifier les panels :
   - `notification_email_sent_total` par module/template/locale
   - `notification_email_bounced_total` par type
   - `notification_email_complained_total`
   - `notification_email_send_duration_seconds` histogram (p95 visible)
   - `notification_email_dlq_size` gauge
3. Forcer un pic de bounces (script de test qui simule 100 bounces SNS) :
   ```bash
   pnpm tsx scripts/dev/simulate-bounce-storm.ts --count 100 --over-seconds 60
   ```
4. Vérifier que l'alerte `notification.bounce_rate_high` est levée
   dans `#ops-page` Slack au-delà du seuil 5 %.
5. Forcer une plainte simulée :
   ```bash
   pnpm tsx scripts/dev/simulate-complaint.ts
   ```
6. Vérifier alerte si dépassement 0,1 %.
7. Saturer la DLQ (provoquer 51 dead-letters) :
   ```bash
   pnpm tsx scripts/dev/saturate-dlq.ts --count 51
   ```
8. Vérifier alerte `notification.dlq_size_high` dans `#ops-warn`.

**Pass criteria** :
- ✅ Métriques visibles dans Grafana
- ✅ Alertes routées dans les bons canaux Slack
- ✅ Seuils respectent FR-018 à FR-021

---

## Scénario 9 — A11y console admin (Principe XI)

**But** : vérifier WCAG 2.1 AA sur la console admin notifications.

**Étapes** :

1. Lancer `pnpm --filter @cv/web test:a11y` (Playwright + axe-core).
2. Tests ciblent les routes :
   - `/fr/admin/notifications/suppression-list`
   - `/fr/admin/notifications/dead-letter`
   - `/fr/admin/notifications/audit`
3. Aucune erreur de niveau `serious` ou `critical` autorisée.
4. Test manuel au clavier :
   - Tab navigation atteint tous les boutons d'action.
   - Focus visible.
   - Modal de retrait ouvre/ferme au clavier.
   - Champ motif a `<label>` associé et `aria-describedby` pour
     l'aide.
5. Test lecteur d'écran (NVDA Windows ou VoiceOver macOS) sur le
   parcours principal — note dans `docs/a11y/release-NN.md`.

**Pass criteria** :
- ✅ axe-core 0 erreur sérieuse/critique
- ✅ Contraste 4,5:1 minimum vérifié sur la console
- ✅ Navigation clavier complète
- ✅ Annotations lecteur d'écran présentes

---

## Smoke test final avant merge

Exécuter en séquence :

```bash
# Tests unitaires (domaine pur)
pnpm --filter @cv/api test:unit -- notifications

# Tests intégration (Testcontainers)
pnpm --filter @cv/api test:integration -- notifications

# Tests E2E (Playwright)
pnpm --filter @cv/web test:e2e -- admin/notifications

# Type check + lint
pnpm typecheck
pnpm lint

# Frontière modulaire
pnpm tsx tools/check-module-boundaries.ts

# A11y
pnpm --filter @cv/web test:a11y -- admin/notifications

# Lighthouse CI sur les pages publiques (régression check)
pnpm --filter @cv/web lighthouse:ci
```

Tous **DOIVENT** passer. Si l'un échoue, le merge est bloqué.

---

## Pré-requis ops avant déploiement prod

Distincts du dev (à orchestrer par l'équipe ops en parallèle de
l'implémentation) :

1. **Domaine DNS** : créer `notifications.conseiller-voyage.ca` en
   Route 53.
2. **DKIM/SPF/DMARC** : configurer enregistrements pour SES :
   - SPF : `v=spf1 include:amazonses.com -all`
   - DKIM : 3 CNAME pour les sélecteurs SES
   - DMARC : `v=DMARC1; p=quarantine; rua=mailto:dmarc@conseiller-voyage.ca`
3. **SES Production Access** : ticket support AWS pour quitter le
   sandbox (justifier le use case, le volume, et la stratégie
   anti-spam — formulaire AWS standard).
4. **SES Configuration Set** : créer `notifications-prod` avec event
   destination → SNS topic.
5. **SNS Topic** : créer `notifications-ses-events` en `ca-central-1`.
6. **Lambda** : déployer `apps/lambda-bounces-handler` via CDK.
7. **Secrets** : poser `NOTIFICATIONS_EMAIL_HASH_PEPPER` et
   `NOTIFICATIONS_SNS_HMAC_SECRET` dans Secrets Manager `ca-central-1`.
8. **IAM roles** : créer roles avec policies minimales (ECS task pour
   `api-worker` lit SES + Secrets ; Lambda lit Secret + log + HTTPS
   sortant).
9. **Grafana dashboards** : importer `docs/dashboards/notifications.json`.
10. **Alerting** : créer routes Slack vers `#ops-page` et `#ops-warn`
    dans Grafana Alertmanager.
