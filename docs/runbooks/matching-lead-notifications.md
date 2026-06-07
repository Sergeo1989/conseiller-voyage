# Runbook — Notifications conseiller + leads (feature 012)

> Module `matching`, extension aval 012. Voir aussi
> [`matching-rematch.md`](./matching-rematch.md), ADR-0025, ADR-0026.

## Vue d'ensemble du flux

```
011 matching_outbox_entries ──drain T093──► bus Redis `matching.events`
   └─► MatchingEventsConsumer (subscribe)
        └─► ConsumeMatchingEventUseCase
             ├─ dédup consumed_matching_events
             ├─ supersession (leads ancien MR → perdu)
             ├─ leads (UNIQUE conseiller×MR) + lead_notification_outbox (pending)
        └─► LeadNotificationDispatcher (1 job BullMQ / destinataire)
             └─► LeadNotificationWorker → SesLeadNotificationMailer → SES
   filet : LeadReconciliationScheduler (sweep MR actifs sans lead)
```

## Tables & files

| Objet | Rôle |
|---|---|
| `leads` | 1 par (conseiller × MatchingResult), `current_state` dénormalisé |
| `lead_transitions` | historique **append-only** (trigger Postgres) |
| `lead_notification_outbox` | file notifications (`pending`/`sent`/`failed`/`skipped_unverified`) |
| `consumed_matching_events` | dédup at-least-once du bus |
| Queue BullMQ `matching.lead-notifications` | un job par destinataire (`jobId = notificationId`) |

## Incidents fréquents

### Notifications bloquées en `pending`
1. Vérifier le worker BullMQ (logs `LeadNotificationWorker`).
2. Vérifier Redis (queue `matching.lead-notifications`).
3. Le `LeadNotificationDispatcher` tourne par intervalle (5 s prod) — confirmer
   que le module est démarré (logs `Abonné au canal matching.events`).
4. Forcer un dispatch : redéploiement OU attendre l'intervalle.

### Notifications en `failed` (SES HS)
- Symptôme : `lead_notification_outbox.status = failed`, `last_error` renseigné.
- Le job BullMQ retente avec backoff exponentiel (5 tentatives) puis dead-letter.
- **Au rétablissement SES** : les jobs en backoff repartent automatiquement.
  Pour rejouer les dead-letters : remettre `status = pending` sur les lignes
  concernées (le dispatcher ré-enfile). Idempotent — aucun doublon (UNIQUE
  `idempotencyKey`).
- Métrique d'alerte : `cv.matching.lead.notification_failed` (taux > seuil).

### Leads manquants (bus HS / message perdu)
- Le pub/sub Redis est **lossy** : un message émis worker arrêté est perdu.
- Le **sweep de réconciliation** (`LeadReconciliationScheduler`, 60 s prod)
  recrée les leads des MR actifs (`ok`/`partial`) sans lead. Aucun doublon
  (UNIQUE conseiller×MR).
- Vérifier les logs `Réconciliation : N lead(s) recréé(s)`.

### `skipped_unverified`
- Comportement **attendu** : le conseiller n'était pas vérifié au moment de la
  consommation ou de l'envoi (FR-008). Aucun courriel envoyé. Re-vérification
  dynamique via `ConformiteQueryPort`.

### Brief anonymisé (Loi 25)
- Trigger `trg_lead_anonymise_cascade` met `leads.brief_id = NULL`.
- `lead_transitions` **jamais** touché (audit préservé 7 ans).
- Notification d'un lead dont le brief est anonymisé : supprimée (non bloquante),
  marquée `sent` sans envoi.

## Réconciliation manuelle

Si un doute sur la complétude, déclencher un sweep en redémarrant l'API (ou
attendre l'intervalle). Le sweep est idempotent et borné (`limit = 100`).

## Observabilité

- Métriques OTel `cv.matching.lead.*` (created, transition{to_state},
  notification_sent, notification_failed) → Grafana Cloud Canada (ADR-0003).
- Logs Pino PII-safe (ids + états uniquement) sur `ConsumeMatchingEventUseCase`.
- CLI anti-PII : `tools/check-no-pii-matching-audit.ts` scanne aussi
  `lead_transitions` / `lead_notification_outbox`.

## Sécurité / conformité

- Aucune PII de contact voyageur dans les notifications (FR-004).
- Endpoints conseiller : `AuthGuard` + `RoleGuard('conseiller')` + autorisation
  propriétaire + re-check verified à chaque action.
- `lead_transitions` append-only (défense en profondeur : trigger + REVOKE).
