# Quickstart — Notifications + magic-link de suivi voyageur (017 / roadmap 010)

## Prérequis
- Stack dev : `docker compose -f docker-compose.dev.yml up -d` (Postgres + Redis + LocalStack).
- API : `pnpm --filter @cv/api start:dev`.
- Migration appliquée (`intake_voyageur_notifications`).
- SES en dev : LocalStack ou mailer stub (aucun envoi réel).

## Parcours de validation

### US1 — Notification « conseillers prêts »
1. Activer un brief, provoquer l'événement matching `voyageur.brief.matched` (3 conseillers) →
   **une** `VoyageurNotification(type=conseillers_prets)` créée, puis un courriel FR-CA part avec
   **prénoms + spécialités** des conseillers + un lien de suivi. **Aucune** coordonnée de contact.
2. `partially_matched` (1–2) → courriel adapté. `unmatched` (0) → message rassurant
   `recherche_en_cours` (jamais d'échec).
3. Rejouer le même événement → **aucun** doublon (idempotence).

### US2 — Accusé d'activation
4. Vérifier un brief (magic-link 008) → **un** accusé `accuse_activation`, distinct du courriel
   de vérification.

### US3 — Lien de suivi durable
5. Cliquer le lien de suivi d'un courriel → page récap `/voyage/[token]`. Lien expiré → renvoi
   (ResendMagicLink) → nouvel accès.

### Loi 25 / mode dégradé
6. Effacer un brief (RequestBriefErasure) avec une notification en attente → elle passe
   `annulee`, aucun envoi ultérieur.
7. Couper SES (stub en échec) → la notification reste `en_attente`, réessayée ; activation et
   matching jamais bloqués.

## Tests
```bash
# Fonctions pures (TDD) : selectNotificationForOutcome + invariant anti-PII/anti-marketplace
pnpm --filter @cv/api test -- voyageur-notification

# Intégration (DB réelle) : enqueue idempotent, cascade annulation, dispatch, mode dégradé
pnpm --filter @cv/api test -- voyageur-notif.integration
```

## DoD avant PR
- Fonctions pures TDD (sélection type + suppression anti-spam) écrites avant impl (Principe VI).
- Invariant : **0 coordonnée de contact / 0 montant** dans la notification ; prénom+spécialité
  publics seulement (FR-002/009, SC-002).
- Idempotence (1 notif/événement), mode dégradé (SES HS → réessai, jamais bloquant).
- Cascade Loi 25 (annulation), région CA, FR-CA + i18n EN, métriques OTel.
- Scan anti-PII étendu à `intake_voyageur_notifications` ; migration testée.

## Statut de validation

| SC | Critère | Statut | Preuve |
|----|---------|--------|--------|
| SC-001 | matched → 1 notif `conseillers_prets`, 0 doublon au rejeu | ✅ | `voyageur-notification.integration.test.ts` |
| SC-002 | prénoms + spécialités publics seulement (0 contact) | ✅ | `prisma-conseiller-public-display-reader` (re-check `pret`×`verified`) + invariant T011 |
| SC-003 | SES HS → reste `en_attente` (réessai non bloquant) | ✅ | `voyageur-notification-sender.test.ts` (throw → 0 mark) |
| SC-004 | 0 PII en base (scan) | ✅ | `tools/check-no-pii-matching-audit.ts` étendu à `intake_voyageur_notifications` |
| SC-005 | effacement Loi 25 → notifications en attente `annulee` | ✅ | `request-brief-erasure.use-case.test.ts` (cascade) |
| SC-006 | unmatched → `recherche_en_cours` (ton rassurant, pas d'échec) | ✅ | template `voyageur-still-searching` + intégration |
| SC-007/009 | observabilité ré-engagement | ✅ (métriques) | meter `cv.intake.voyageur_notification.*` (T026) |
| SC-008 | accusé d'activation distinct du verify | ✅ | `voyageur-activation-ack.integration.test.ts` |
| US3 | lien de suivi durable + renvoyable | ✅ | `voyageur-status-link.integration.test.ts` |

**Avant prod (restant)** : validations staging (charge), secret `DATABASE_URL_STAGING`
(workflow scan PII), **ratification humaine de la copie FR-CA** des 3 templates (ton
« prêts » conformité OPC/TICO), image OG/branding courriel.
