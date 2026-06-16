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
À compléter au `/speckit.tasks` + implémentation (mapping SC-001→SC-009).
