# Implementation Plan : Notifications et courriel transactionnel

**Branch** : `003-notifications-transactionnelles` | **Date** : 2026-05-26 |
**Spec** : [spec.md](./spec.md)

**Input** : Feature specification from
`/specs/003-notifications-transactionnelles/spec.md` (5 clarifications
session 2026-05-26)

---

## Summary

Cette feature livre le moteur transactionnel courriel qui débloque
l'ensemble du Tier 0. Trois modules mergés (001 conformité, 002 auth,
002a MFA) ont posé des tables outbox qui s'accumulent sans worker
d'envoi. Cette feature :

1. Crée un module top-level `notifications` qui draine ces outbox via
   un worker BullMQ et envoie vers AWS SES `ca-central-1` (ADR-0006).
2. Consolide les 13 templates `react-email` existants (4 auth + 5 MFA
   + 4 conformité) dans `packages/email-templates/` et complète les
   templates manquants (accusé soumission, TOTP activé, confirmation
   effacement Loi 25).
3. Implémente la boucle de feedback SES → SNS → Lambda → suppression
   list pour protéger la réputation d'envoi (bounce < 3 %, complaint
   < 0,05 %).
4. Expose une facade publique `NotificationPort` consommée par
   chaque module source via leur propre worker (pas de drainage
   cross-module — respect Principe V).
5. Instrumente les SLO de délivrabilité (OTel → Grafana Cloud Canada,
   ADR-0003), avec alerting vers Slack `#ops-page` et `#ops-warn`.
6. Expose une console admin pour consulter/retirer manuellement
   suppression list et relancer dead-letters, accessible à tout
   utilisateur portant le rôle `admin` avec audit append-only.

Approche technique : worker BullMQ ré-entrant safe, idempotence via
`outboxEntry.id` propagé en `correlationId` SES, anti-spam Gmail
aliasing canonicalisé avant lookup suppression list, hash HMAC peppered
(`NOTIFICATIONS_EMAIL_HASH_PEPPER` en AWS Secrets Manager) pour la
suppression list et le journal post-effacement Loi 25.

---

## Technical Context

**Language / Version** : TypeScript ≥ 5.5 strict, mode
`noUncheckedIndexedAccess` activé (constitution).

**Primary Dependencies** :
- NestJS + `@nestjs/platform-fastify` (controllers admin)
- `@aws-sdk/client-sesv2` ≥ 3.600 (envoi)
- `@aws-sdk/client-sns` ≥ 3.600 (souscription bounce/complaint si CDK
  pose le subscription, sinon HTTP webhook)
- BullMQ ≥ 5 (cohérent avec OutboxPublisherJob 001 et MFA queue 002a)
- Prisma ≥ 6 (nouvelles tables `notification_*`)
- Zod ≥ 3.23 (validation payload envelope + admin endpoints)
- `react-email` + `@react-email/components` (déjà adoptés dans
  `packages/email-templates/`)
- next-intl (catalogue i18n FR-CA / EN partagé)
- Pino (logger structuré)
- `@opentelemetry/api` + `@opentelemetry/sdk-node` (déjà configuré côté
  apps/api)

**Storage** : PostgreSQL ≥ 16 en `ca-central-1`. Trois nouvelles tables :
`notification_email_log`, `notification_suppression_list`,
`notification_audit_entries`. Aucun JOIN cross-module sur les tables
outbox sources (`auth_outbox_emails`, `mfa_outbox_emails`,
`conformite_outbox`) — chaque module source possède son propre worker
de drainage qui appelle `NotificationPort.send()`.

**Testing** : Vitest unit (fonctions pures du domaine), Testcontainers
intégration (Postgres + Redis isolés, LocalStack SES mock), MSW pour
les appels SES en tests d'intégration légers, Playwright E2E pour la
console admin.

**Target Platform** : AWS ECS Fargate `ca-central-1` (ADR-0005). Worker
BullMQ dans un service ECS séparé (`api-worker` ou tâche scheduled), la
console admin web vit dans `apps/web` existant. Le composant serverless
qui parse les notifications SES → SNS → suppression list est une AWS
Lambda déployée via CDK (ADR-0005).

**Project Type** : Web application (Next.js frontend + NestJS backend +
worker BullMQ + Lambda serverless), monolithe modulaire (Principe V).

**Performance Goals** :
- Volume nominal : 5 000 courriels/jour (cible M18, clarification Q1).
- Pic horaire : 1 500 courriels/heure (vendredi 9 h heure de l'Est
  pour les rappels d'expiration certificats).
- Latence p95 dépôt outbox → SES accepté : < 2 s (SC-002).
- Latence p95 SES accepté → SNS delivery : < 30 s (SC-002).
- Quota SES production cible : 50 000/jour (marge 10×).

**Constraints** :
- Tout traitement de PII en région `ca-central-1` exclusivement
  (Principe II NON-NÉGOCIABLE).
- Conservation journal d'envoi 24 mois (cf. tableau de rétention
  constitution).
- Conservation journal d'audit 7 ans (cf. constitution).
- Bounce rate < 3 % et complaint rate < 0,05 % (sous les seuils SES de
  5 % et 0,1 % qui déclenchent suspension automatique).
- Frontière transactionnelle (Principe I) : aucun courriel ne porte
  d'information de paiement client ni de réservation de voyage.

**Scale / Scope** :
- 13 templates `react-email` consolidés + ~3 nouveaux templates à
  ajouter pour couvrir les `eventType` non couverts (accusé soumission
  conformité, TOTP activé post-setup, confirmation effacement Loi 25).
- Worker BullMQ mono-instance (5 000/jour ≈ 1 envoi/15 s en moyenne).
- 3 modules sources branchés J1 : 001 conformité, 002 auth, 002a MFA.
  Le facade `NotificationPort` est conçue pour accueillir les modules
  à venir (008 intake voyageur, 012 matching) sans modification.
- 8 endpoints HTTP admin (CRUD console suppression list, DLQ
  inspection, retry, audit log).

---

## Constitution Check

*GATE : DOIT passer avant Phase 0 (recherche). Re-vérifier après
Phase 1 (design).*

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE)

✅ **Conforme**. La feature 003 livre uniquement de la notification
transactionnelle — elle ne touche aucun :

- Encaissement client final (interdit, frontière transactionnelle).
- Versement fournisseur (interdit).
- Confirmation de réservation (interdit).

Les courriels envoyés véhiculent uniquement de l'information : statut
de vérification conformité, accusé de soumission, lien de vérification
courriel, code TOTP, rappel d'expiration certificat. Le contenu ne
peut jamais contenir un lien de paiement ni un montant transactionnel
client. Cette interdiction sera vérifiée au build via un test sur les
templates (`assert !template.contains('paiement', 'pay', 'stripe',
'card', '$ ')`) sauf pour l'unique template d'abonnement conseiller
B2B (différé feature 006 facturation).

Filtrage statut conformité : non applicable directement à cette
feature (elle ne décide pas qui est visible publiquement, elle envoie
seulement aux destinataires précisés par les modules sources).

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE)

✅ **Conforme**. Données personnelles traitées :

| Donnée | Justification minimisation | Rétention |
|---|---|---|
| Adresse courriel du destinataire (en clair) | nécessaire à l'envoi | purgée à T+24 mois post-envoi OU dès effacement Loi 25 (US5) |
| Sujet et corps du courriel | trace pour support utilisateur | purgés en même temps que l'adresse |
| Hash HMAC peppered de l'adresse (`recipientEmailHashHMAC`) | dédoublonnage suppression list + audit anti-resoumission post-effacement | conservé 7 ans dans `notification_audit_entries` |
| `recipientLocale` (FR-CA / EN) | rendu du template | purgée avec le log |
| `correlationId` (UUID outbox source) | idempotence + traçabilité | conservé 7 ans dans audit |

Résidence canadienne confirmée :
- PostgreSQL `ca-central-1` (CLAUDE.md).
- AWS SES `ca-central-1` (ADR-0006).
- AWS SNS + Lambda parser bounces : `ca-central-1` (ADR-0005).
- AWS Secrets Manager `ca-central-1` pour `NOTIFICATIONS_EMAIL_HASH_PEPPER`.

Effacement implémenté de bout en bout : US5 + FR-022. Routine
`EraseRecipientHistoryUseCase` consommée par feature 023 à venir.

### III. Qualité de lead avant volume

✅ **Non applicable directement**. Cette feature ne crée pas de leads
et n'applique pas de scoring. Elle peut véhiculer des notifications
de la machine d'état lead (intégration future avec feature 012
matching), sans participer aux décisions de matching elles-mêmes.

### IV. Français d'abord

✅ **Conforme**. Tous les templates sont fournis en FR-CA premier (les
13 existants le sont déjà). Catalogue `next-intl` partagé pour
EN-secondaire. Aucun template ne sera mergé sans sa version FR-CA.
La console admin (US6) sera elle aussi en FR-CA premier, conformément
à la convention 001 conformité.

### V. Architecture : monolithe modulaire

✅ **Conforme**. Module top-level `notifications` créé dans
`apps/api/src/modules/notifications/`. Pas de drainage cross-module :
chaque module source (001/002/002a) pose son **propre** worker dans
son propre code (`apps/api/src/modules/<module>/infrastructure/jobs/`)
qui appelle la facade publique `NotificationPort.send()`.

Le module notifications expose **uniquement** un seul port public
(`NotificationPort`) ; ses internes (use cases, ports, adapters) sont
strictement privés.

Aucun LLM dans cette feature → plafond 0,05 USD/requête non applicable.

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE)

✅ **Conforme**. Logique métier sensible identifiée :

- **`canonicalizeEmail(email)`** : normalisation Gmail aliasing (strip
  `+suffix` et `.` partie locale pour `@gmail.com`/`@googlemail.com`).
- **`hashRecipientEmail(emailCanonical, pepper)`** : HMAC-SHA-256
  peppered.
- **`shouldSuppress(email, suppressionList, now)`** : décision
  d'abandonner un envoi en fonction de la suppression list (avec gestion
  de l'expiration pour soft bounces).
- **`renderTemplate(template, data, locale)`** : rendu déterministe
  (React.renderToStaticMarkup) — testé par snapshot avec dataset fixe.
- **`computeBackoff(attemptCount)`** : 5 tentatives sur 24 h avec
  delays `[1 min, 5 min, 30 min, 4 h, 24 h]`.

Toutes ces fonctions sont pures (zéro I/O caché : pas de DB, pas de
réseau, pas d'horloge non injectée). Tests Vitest écrits **avant**
implémentation, commits séparés ordonnés (RED → GREEN → REFACTOR) :
preuve dans l'historique git.

### VII. Observabilité de la boucle économique

🟡 **Indirect**. Cette feature ne touche pas directement les 4
métriques de premier ordre (taux complétion intake, % leads acceptés,
conversion lead→devis→réservation, churn conseiller). Mais elle est
**condition nécessaire** :

- Sans cette feature, le taux de complétion intake (feature 008 à
  venir) inclura les voyageurs perdus parce que le magic link n'est
  pas envoyé → métrique faussée bas.
- Sans cette feature, les conseillers ne reçoivent jamais l'invitation
  → churn artificiel haut.

Métriques spécifiques 003 (cf. FR-017) instrumentées via OTel et
exposées sur Grafana Cloud Canada (ADR-0003). Tableau de bord
`docs/dashboards/notifications.json` créé et lié dans le README du
module. Routing alertes :

- Page → Slack `#ops-page` (mention `@channel`, sévérité élevée)
- Warn → Slack `#ops-warn` (silent, ack manuelle).

### VIII. Clean Architecture et SOLID

✅ **Conforme**. Voir [Project Structure](#project-structure).

- **domaine** : value objects (`EmailAddress`, `EmailLocale`,
  `EmailTemplateId`), enums (`NotificationStatus`,
  `SuppressionReason`), fonctions pures listées en Principe VI.
  Aucun import NestJS/Prisma/AWS.
- **application** : 7 use cases (`SendNotificationUseCase`,
  `RecordBounceUseCase`, `RecordComplaintUseCase`,
  `RecordDeliveryUseCase`, `EraseRecipientHistoryUseCase`,
  `RemoveFromSuppressionListUseCase`, `RetryDeadLetterUseCase`),
  8 ports (`EmailSender`, `SuppressionListReader/Writer`,
  `NotificationLogReader/Writer`, `NotificationAuditLogWriter`,
  `EmailTemplateRenderer`, `Clock`).
- **infrastructure** : adapters concrets (`SesEmailSender`,
  `PrismaSuppressionList`, etc.), workers BullMQ
  (`NotificationDispatchWorker`), Lambda SNS parser
  (`apps/lambda-bounces-handler/`).
- **interface** : un controller NestJS admin
  (`AdminNotificationsController`), une facade publique
  (`NotificationPort`), un endpoint HTTPS POST exposé à la Lambda SNS
  (`SnsNotificationController` interne, signé HMAC).

**SOLID** :
- **S** : un use case = une action métier (envoi, enregistrement
  bounce, etc.).
- **O** : ajouter un module source consommateur de `NotificationPort`
  ne modifie pas le code interne du module notifications.
- **L** : `InMemorySesEmailSender` (pour tests) honore le contrat du
  port `EmailSender`, idempotence + retry inclus.
- **I** : ports granulaires
  (`SuppressionListReader` ≠ `SuppressionListWriter`).
- **D** : tous les use cases dépendent de ports, jamais des adapters.

### IX. Sécurité applicative (NON-NÉGOCIABLE)

✅ **Conforme**.

**RBAC** : tous les endpoints admin de `AdminNotificationsController`
sont gardés par `RequireRole('admin')` (utilise `RoleGuard` existant
de 002 identité). Vérification en couche application : chaque use case
admin reçoit un `AuthenticatedUser` et valide le rôle avant action.

**MFA** : la console admin US6 nécessite session MFA active (héritée
de 002a — RoleGuard chaîné avec MfaSessionGuard).

**Secrets** : `NOTIFICATIONS_EMAIL_HASH_PEPPER`
(256 bits cryptographiquement aléatoires) stocké en AWS Secrets Manager
`ca-central-1`. Aucun secret en clair dans le repo. Lecture au boot
via SDK Secrets Manager.

**En-têtes HTTP** : aucun nouveau endpoint public exposé hors admin.
Les endpoints admin utilisent les en-têtes HTTP standards déjà posés
par 001 sur Fastify (CSP, HSTS, X-Content-Type-Options, etc.).

**Protections** :
- CSRF : Server Actions Next.js pour la console admin (protection
  native Auth.js v5).
- XSS : `react-email` rend du HTML statique sans `dangerouslySetInnerHTML`
  sur contenu utilisateur. Toute variable de template est échappée par
  `react-email` par défaut.
- SQL injection : Prisma exclusivement, aucun SQL brut.
- Zod côté serveur : validation des payloads de tous les endpoints
  admin + validation du payload `NotificationEnvelope` reçu par la
  facade publique.

**OWASP Top 10** (revue obligatoire) : voir
[checklists/owasp.md](./checklists/owasp.md) à créer en Phase 1
(format identique à `001-conformite-module/checklists/dod.md`).

**Patch CVE** : Renovate + `npm audit` en CI, déjà actifs sur le repo.

### X. Fiabilité et résilience

✅ **Conforme**.

**SLO** : voir Performance Goals + spec SC-001 à SC-011.

**Idempotence** obligatoire pour toutes les écritures publiques de la
feature :
- `NotificationPort.send(envelope)` : `envelope.correlationId` est
  l'identifiant outbox source ; si déjà en `notification_email_log`,
  no-op.
- `Lambda SNS parser` : `eventId` SNS comme clé d'idempotence.
- `RemoveFromSuppressionListUseCase` et `RetryDeadLetterUseCase` :
  header `Idempotency-Key` (UUID v4) requis.

**Modes dégradés** documentés et implémentés :

| Dépendance HS | Comportement |
|---|---|
| AWS SES HS (panne régionale) | Worker temporise (backoff exponentiel jusqu'à 24 h), alerte page à 30 min, file outbox source s'accumule sans perte, replay automatique au retour. |
| Redis HS | BullMQ ne peut plus enqueue ; les workers sources reportent en backoff sur leur outbox. Alerte page immédiate (déjà couverte par 002a/001). |
| Postgres primaire HS | Lecture seule possible depuis réplique pour la console admin ; mutations bloquées avec message clair. Le worker stoppe (lock acquis échoue). |
| Lambda SNS parser HS | Suppression list n'est plus alimentée automatiquement ; bounces accumulés en file SNS avec rétention 14 jours par défaut → replay possible. Alerte warn si > 1 h. |
| **SNS topic HS** (région ou config error) | Events SES bounce/complaint plus reçus → suppression list pas alimentée → risque de dépasser 5 % bounce SES et suspension du compte. Alerte page après 15 min sans event reçu (gauge `notification_email_sns_events_received_total` plate). Replay manuel possible en re-souscrivant la Lambda + re-publication via console SES. |
| **AWS Secrets Manager HS** | Au boot : refus de démarrer le service NestJS (fail-fast — `NOTIFICATIONS_EMAIL_HASH_PEPPER` indisponible, impossible de hasher). En runtime : le cache local 1 h dans le process (cf. research R6) couvre une panne courte. Au-delà : worker stoppe, alerte page immédiate. |
| **DNS Route 53 HS** | Très improbable (multi-AZ), mais : SES utilise l'IP backup. Les destinataires peuvent recevoir avec retard. Si DKIM lookup échoue chez l'ESP destinataire, bounce soft transient (replay automatique au retour). |

**Circuit breakers** : sur les appels SDK SES, après 5 échecs en 60 s,
ouvert pour 30 s puis demi-ouvert. Implémenté via `opossum` (lib
établie) ou retry/timeout natif AWS SDK (à arbitrer en research.md).

**Health checks** : `/healthz` (worker BullMQ alive + Redis ping) et
`/readyz` (peut joindre SES + DB). Exposés sur le service `api-worker`
ECS.

### XI. Accessibilité WCAG 2.1 AA (NON-NÉGOCIABLE)

✅ **Conforme**.

**Console admin US6** :
- Composants `shadcn/ui` (Radix UI sous le capot, accessibles par
  construction).
- Navigation 100 % clavier : table de suppression list avec tri/filtre
  via composants Radix.
- Contraste : palette du design system existant 001, respect 4,5:1
  minimum.
- Tests `axe-core` en CI Playwright bloquants.

**Templates email** :
- Rendu mobile-first (largeur ≤ 375 px sans scroll horizontal).
- Mode sombre safe : couleurs définies en tokens (pas d'inversion auto).
- Contraste 4,5:1 minimum sur texte vs fond.
- Sémantique HTML émail (titres `h1/h2`, listes, liens explicites).
- `alt` descriptif sur image-logo (si présente), vide sur images
  décoratives.

### XII. Optimisation SEO (NON-NÉGOCIABLE)

🟡 **Non applicable directement**. Aucune page publique
indexable créée par cette feature. La console admin US6 est `noindex`
par défaut (route authentifiée). Les courriels eux-mêmes ne sont pas
indexés par les moteurs.

Indirectement : cette feature débloque la vérification courriel des
conseillers, ce qui débloque la création de profils publics (feature
005, qui sera elle SEO-critique). Sans 003, pas de SEO indirect.

### Definition of Done

Cette feature suit la DoD complète de la constitution (cf.
`/.specify/memory/constitution.md` ligne 810). À cocher avant merge
final :

- [ ] spec.md mergée (en cours sur cette branche)
- [ ] plan.md mergé avec section Constitution Check explicite (ce
      fichier)
- [ ] tasks.md généré par `/speckit-tasks` et toutes tâches cochées
- [ ] Tests unitaires Vitest passent + couvrent canonicalisation
      email, hash HMAC, backoff, suppression decision (Principe VI)
- [ ] Tests intégration Testcontainers : drainage outbox bout-en-bout,
      enregistrement bounce SNS, retry DLQ
- [ ] Tests E2E Playwright sur console admin (US6)
- [ ] `axe-core` passe sans erreur critique sur console admin
- [ ] Lighthouse CI : pas de régression > 10 % (console admin
      auth-only, peu impactant trafic public)
- [ ] Biome + `tsc --noEmit` zéro erreur
- [ ] Métriques Principe VII : tableau de bord
      `notifications.json` créé et lié dans README
- [ ] SLO Principe X : p95 send < 2 s mesuré en charge nominale
- [ ] Sécurité Principe IX : checklist OWASP cochée,
      `NOTIFICATIONS_EMAIL_HASH_PEPPER` posé en Secrets Manager,
      en-têtes HTTP en place, validation Zod côté serveur
- [ ] Documentation FR-CA : `apps/api/src/modules/notifications/README.md`
- [ ] ADR créés : `0013-pepper-hash-emails-notifications.md`,
      `0014-multi-tenant-templates-architecture.md` (selon research.md)
- [ ] Migration Prisma testée en staging avec rollback applicatif
- [ ] Domaine `notifications.conseiller-voyage.ca` créé en Route 53,
      DKIM/SPF/DMARC posés, SES production access demandé
- [ ] Revue de code approuvée

---

## Project Structure

### Documentation (this feature)

```text
specs/003-notifications-transactionnelles/
├── plan.md                  # This file (/speckit-plan output)
├── spec.md                  # /speckit-specify output (mergé)
├── research.md              # Phase 0 output (this command)
├── data-model.md            # Phase 1 output (this command)
├── quickstart.md            # Phase 1 output (this command)
├── contracts/
│   ├── notification.port.md          # Facade publique consommée par 001/002/002a/008/012
│   ├── http-endpoints.md             # 8 endpoints admin REST
│   ├── outbox-source-contract.md     # Contrat que chaque module source respecte
│   └── sns-event-schema.md           # Payload SNS Bounce/Complaint/Delivery
├── checklists/
│   ├── requirements.md      # Quality validation spec (mergé)
│   └── owasp.md             # OWASP Top 10 review (Phase 1, après data-model)
└── tasks.md                 # /speckit-tasks output (futur)
```

### Source Code (repository root)

```text
apps/
├── api/
│   └── src/modules/
│       ├── notifications/                        # NOUVEAU module top-level
│       │   ├── domain/
│       │   │   ├── value-objects/
│       │   │   │   ├── email-address.vo.ts
│       │   │   │   ├── email-locale.vo.ts
│       │   │   │   └── email-template-id.vo.ts
│       │   │   ├── entities/
│       │   │   │   ├── notification-envelope.entity.ts
│       │   │   │   ├── notification-log-entry.entity.ts
│       │   │   │   └── suppression-list-entry.entity.ts
│       │   │   ├── enums/
│       │   │   │   ├── notification-status.enum.ts
│       │   │   │   └── suppression-reason.enum.ts
│       │   │   └── pure-functions/
│       │   │       ├── canonicalize-email.ts
│       │   │       ├── hash-recipient-email.ts
│       │   │       ├── should-suppress.ts
│       │   │       └── compute-backoff.ts
│       │   ├── application/
│       │   │   ├── ports/
│       │   │   │   ├── email-sender.port.ts
│       │   │   │   ├── suppression-list-reader.port.ts
│       │   │   │   ├── suppression-list-writer.port.ts
│       │   │   │   ├── notification-log-reader.port.ts
│       │   │   │   ├── notification-log-writer.port.ts
│       │   │   │   ├── notification-audit-log-writer.port.ts
│       │   │   │   └── email-template-renderer.port.ts
│       │   │   └── use-cases/
│       │   │       ├── send-notification.use-case.ts
│       │   │       ├── record-bounce.use-case.ts
│       │   │       ├── record-complaint.use-case.ts
│       │   │       ├── record-delivery.use-case.ts
│       │   │       ├── erase-recipient-history.use-case.ts
│       │   │       ├── remove-from-suppression-list.use-case.ts
│       │   │       ├── retry-dead-letter.use-case.ts
│       │   │       ├── sweep-expired-suppressions.use-case.ts          # purge soft bounces TTL (FR-026 + R8)
│       │   │       └── sweep-retention.use-case.ts                     # anonymisation T+24m (FR-026)
│       │   ├── infrastructure/
│       │   │   ├── ses-email-sender.ts
│       │   │   ├── prisma-suppression-list.ts
│       │   │   ├── prisma-notification-log.ts
│       │   │   ├── prisma-notification-audit-log-writer.ts
│       │   │   ├── react-email-renderer.ts
│       │   │   └── jobs/
│       │   │       ├── notification-dispatch.worker.ts
│       │   │       ├── notification-retention-sweep.job.ts             # cron mensuel → SweepRetentionUseCase
│       │   │       └── suppression-list-expiration-sweep.job.ts        # cron quotidien → SweepExpiredSuppressionsUseCase
│       │   ├── interface/
│       │   │   ├── public-api/
│       │   │   │   └── notification.port.ts          # Facade exposée aux modules consommateurs
│       │   │   ├── http/
│       │   │   │   ├── admin-notifications.controller.ts
│       │   │   │   └── sns-webhook.controller.ts     # signé HMAC, interne (appelé par Lambda)
│       │   │   └── notifications.module.ts
│       │   └── README.md
│       ├── conformite/                           # MODIFIÉ
│       │   └── infrastructure/jobs/outbox-publisher.job.ts  # appelle désormais NotificationPort.send()
│       └── identite/                             # MODIFIÉ
│           └── infrastructure/jobs/
│               ├── auth-outbox-dispatch.worker.ts # NOUVEAU (002)
│               └── mfa-outbox-dispatch.worker.ts  # NOUVEAU (002a)
├── lambda-bounces-handler/                       # NOUVEAU service serverless
│   ├── src/
│   │   ├── handler.ts                            # entrée Lambda
│   │   └── parse-sns-event.ts
│   ├── package.json
│   └── README.md
└── web/                                          # MODIFIÉ
    └── src/app/[locale]/admin/notifications/
        ├── page.tsx                              # console admin (US6)
        ├── suppression-list/page.tsx
        ├── dead-letter/page.tsx
        └── _actions.ts                           # Server Actions vers AdminNotificationsController

packages/
├── email-templates/                              # MODIFIÉ (consolidation)
│   └── src/
│       ├── auth/                                 # existant
│       ├── mfa/                                  # existant
│       ├── conformite/                           # NOUVEAU sous-dossier (migration depuis shared)
│       │   ├── index.ts
│       │   ├── dossier-approved.tsx
│       │   ├── dossier-refused.tsx
│       │   ├── dossier-submitted.tsx             # NOUVEAU template (accusé soumission)
│       │   ├── expiration-reminder.tsx
│       │   ├── revocation.tsx
│       │   └── erasure-confirmed.tsx             # NOUVEAU template (effacement Loi 25)
│       ├── mfa/totp-activated.tsx                # NOUVEAU template (TOTP setup confirmé)
│       └── index.ts                              # re-export consolidé
└── shared/
    └── src/email/templates/conformite/           # SUPPRIMÉ après migration (deprecation note dans README)

infra/                                            # CDK stack (existant ou à créer)
└── lib/notifications-stack.ts                    # SNS topic + Lambda + SES configuration set

docs/
├── adr/
│   ├── 0013-pepper-hash-emails-notifications.md  # NOUVEAU
│   └── 0014-multi-tenant-templates-architecture.md # NOUVEAU si consolidation justifie
└── dashboards/
    └── notifications.json                        # NOUVEAU Grafana dashboard
```

**Structure Decision** : monolithe modulaire NestJS (constitution
Principe V) avec un nouveau module top-level `notifications`. Le code
applicatif vit dans `apps/api/src/modules/notifications/`. Le composant
serverless qui parse les notifications SES → SNS est un service séparé
sous `apps/lambda-bounces-handler/` (cohérent avec ADR-0005). La console
admin est ajoutée sous `apps/web/src/app/[locale]/admin/notifications/`
avec Server Actions vers le controller NestJS. Les templates email
sont consolidés dans `packages/email-templates/` (clarification Q3).

---

## Appendice A — Audit J1 des `eventType`/`templateKind` à couvrir

⚠️ **Audit à finaliser pendant `/speckit-tasks`** (1-2 h de lecture
code). FR-005 du spec exige couverture exhaustive des events posés en
outbox par 001/002/002a — la liste prévisionnelle suivante doit être
validée par grep réel du code mergé.

### Conformité (001) — `conformite_outbox.eventType`

Liste prévisionnelle (à confirmer par
`grep -r "prisma.outboxEntry.create" apps/api/src/modules/conformite/`) :

- `conformite.dossier_submitted` (accusé) ← template à créer
- `conformite.dossier_approved` ← template existant
- `conformite.dossier_refused` ← template existant
- `conformite.expiration_reminder_j30` ← template existant (paramétrable)
- `conformite.expiration_reminder_j15` ← idem
- `conformite.expiration_reminder_j7` ← idem
- `conformite.expiration_reminder_j1` ← idem
- `conformite.permit_revocation` ← template existant
- `conformite.conseiller_suspended` ← à confirmer
- `conformite.erasure_confirmed` ← template à créer

### Auth (002) — `auth_outbox_emails.templateKind` (enum)

Liste exhaustive depuis `AuthEmailTemplate` enum
(`packages/db/prisma/schema/auth-credentials.prisma`) :

- `email_verification` ← template existant
- `password_reset` ← template existant
- `password_changed` ← template existant
- `admin_invitation` ← template existant
- (autres valeurs enum à confirmer)

### MFA (002a) — `mfa_outbox_emails.templateKind` (enum)

Liste exhaustive depuis `MfaEmailTemplateKind` enum :

- `admin_reset` ← template existant
- `device_changed` ← template existant
- `device_change_incomplete` ← template existant
- `login_locked` ← template existant
- `stepup_session_killed` ← template existant
- `totp_activated` ← **template à créer** (post-setup TOTP réussi)

**Décision figée** : au moins **3 nouveaux templates** à créer dans
003 (`dossier_submitted`, `erasure_confirmed`, `totp_activated`).
L'audit complet peut en révéler d'autres ; chaque entrée orpheline
**doit** avoir un template ou être renommée. Aucun `eventType` ne
peut produire un `rendering_failed` au runtime en production.

---

## Appendice B — Cardinality des métriques OTel

Pour éviter l'explosion de séries dans Grafana Cloud Canada :

**Labels AUTORISÉS** sur les métriques notifications :
- `template_id` : ~16 valeurs J1.
- `locale` : 2 valeurs (`fr-CA`, `en`).
- `source_module` : ≤ 6 valeurs.
- `status` : ≤ 10 valeurs (enum `NotificationStatus`).
- `bounce_type` : 3 valeurs (`hard`, `soft`, `undetermined`).

**Cardinality estimée** : 16 × 2 × 6 = **192 séries/métrique** × 5
métriques principales ≈ **1 000 séries**. Budget formel : **2 000
séries notifications maximum**.

**Labels INTERDITS** (cardinality non bornée) :
- `event_type` (libre côté conformité, croît avec le métier).
- `correlation_id` (UUID, cardinality = nombre d'envois).
- `recipient_email_hash` (idem).
- `ses_message_id` (idem).

Ces valeurs vont en **trace attributes** (échantillonnage) ou en
**logs structurés Pino**, pas en metric labels.

---

## Appendice C — Conformité CASL et délivrabilité

### CASL (Loi C-28, Règlement S.O.R./2013-221)

Même les courriels transactionnels doivent inclure **dans le message
lui-même** :

1. **Nom légal** de l'expéditeur (entité Conseiller Voyage Inc. — à
   confirmer avec juriste).
2. **Adresse postale physique** du siège social canadien.
3. **Mécanisme de contact** valide (téléphone OU adresse courriel OU
   URL).

Source unique pour ces 3 champs : config publique dans
`packages/shared/src/brand/brand-info.ts` (lue par chaque template via
prop ou contexte react-email). Si la marque diverge entre environnements,
variables `BRAND_LEGAL_NAME`, `BRAND_POSTAL_ADDRESS`, `BRAND_CONTACT_URL`
posées en env.

### Headers délivrabilité (Gmail/Yahoo 2024+)

Depuis février 2024, expéditeurs > 5 000/jour (quota cible 003) doivent
exposer :

- `List-Unsubscribe: <mailto:unsubscribe-notifications@conseiller-voyage.ca>`
  (présence du header améliore la réputation sans permettre un opt-out
  marketing — convention transactionnelle acceptée).
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).

Posés directement dans le call SES `SendEmailCommand` v2 via le param
`Headers` (configuration set transmet au SMTP final). Pas dans le
template lui-même.

Si page « mes préférences notifications » existe (FR-010 spec, future
US15), ajouter aussi `https://conseiller-voyage.ca/preferences`.

---

## Appendice D — Mise à jour du tool `check-module-boundaries.ts`

Cf. research R14. Le tool `tools/check-module-boundaries.ts` doit être
étendu :

```ts
// MODULE_PREFIXES (ligne ~23)
notifications: ['Notification', 'notification_', 'Suppression'],

// ALLOWED_CROSS_MODULE_SYMBOLS (ligne ~43)
'NotificationPort',
'NOTIFICATION_PORT',
'NotificationEnvelope',
'NotificationEnvelopeSchema',
'NotificationEnvelopeValidationError',
'SendResult',
'SuppressionReason',
```

Tâche correspondante à inscrire dans `tasks.md` (priorité haute, à
faire **avant** le premier import cross-module dans 001/002/002a
sous peine de bloquer la CI).

---

## Complexity Tracking

Aucune violation Constitution Check à justifier. Toutes les décisions
techniques s'inscrivent dans la stack canonique et les patterns
existants 001/002/002a.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| (vide) | (vide) | (vide) |
