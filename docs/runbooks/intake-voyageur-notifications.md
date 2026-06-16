# Runbook — Notifications voyageur (feature 017 / roadmap 010)

Notifications transactionnelles envoyées **au voyageur** sur l'issue de son brief
(`conseillers_prets` / `recherche_en_cours`) + accusé d'activation. Module `intake`.
Pattern outbox + 1 job BullMQ par notification (mirroir 012). Courriels via SES
ca-central-1 (003). Anti-marketplace (ADR-0002) + Loi 25.

## Architecture

```
matching (consume-matching-event, déjà dédupliqué)
   └─ VoyageurMatchNotifier.onBriefOutcome()   [port public @cv/shared/intake]
        └─ NotifyBriefOutcomeUseCase            anti-spam (issue inchangée → suppr.)
             └─ VoyageurNotificationOutbox.enqueue()   table intake_voyageur_notifications
VerifyMagicLinkUseCase (activation 008) ──┘ (type accuse_activation, clé activation:{briefId})

drain périodique (IntakeModule.onModuleInit, 5 s prod / 30 s dev)
   └─ VoyageurNotificationDispatcher.scanPending → file BullMQ intake.voyageur-notifications
        └─ VoyageurNotificationWorker → Sender → SesVoyageurNotificationMailer
             - skip si brief anonymisé (Loi 25) / sans adresse
             - prénom+spécialités via ConseillerPublicDisplayReader (publics+vérifiés)
             - magic-link view_brief_status (durable 7 j) → /<locale>/voyage/<token>
             - SES HS → throw → backoff BullMQ (notif reste en_attente)
```

## États d'une notification (`intake_voyageur_notifications.status`)

`en_attente` → `envoyee` (SES OK) · `echouee` (sans adresse) · `annulee` (cascade Loi 25).
Idempotence : `idempotencyKey` UNIQUE (clé d'événement matching ou `activation:{briefId}`).

## Incidents fréquents

- **Notifications bloquées en `en_attente`** : vérifier Redis (file BullMQ) + SES
  (quota/identité vérifiée ca-central-1). Le drain réenfile automatiquement ;
  les jobs échoués retentent (backoff exponentiel, 5 tentatives).
- **Aucun courriel reçu mais `envoyee`** : vérifier SES (bounce/complaint) + que le
  contact a bien un `email` (sinon `echouee` `no_address`).
- **Doublons suspectés** : impossible par construction (UNIQUE idempotencyKey + jobId=id).
  Vérifier les métriques `cv.intake.voyageur_notification.sent`.

## Observabilité

Meter OTel `cv.intake.voyageur_notification.{enqueued,sent,failed,cancelled}` (labels
`type`, `reason`). Un pic de `failed{reason=ses_error}` = panne SES → mode dégradé actif
(réessai), pas de perte.

## Loi 25

Un effacement de brief (`RequestBriefErasureUseCase`) annule les notifications en attente
(`cancelPendingForBrief` → `annulee`). Aucune PII conseiller n'est stockée
(`conseillerIds` = UUIDs ; prénom/spécialités résolus à l'envoi, jamais persistés).
Scan defense-in-depth : `pnpm exec tsx tools/check-no-pii-matching-audit.ts`.
