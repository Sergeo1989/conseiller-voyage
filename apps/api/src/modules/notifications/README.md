# Module `notifications`

**Feature** : 003 — notifications + courriel transactionnel
**Statut** : 🔵 implémentation en cours (branche
`003-notifications-transactionnelles`)
**Spec** :
[`specs/003-notifications-transactionnelles/`](../../../../../specs/003-notifications-transactionnelles/)

---

## Vue d'ensemble

Moteur transactionnel courriel centralisé. Reçoit les
`NotificationEnvelope` des modules sources (001 conformité, 002 auth,
002a MFA, 008+ à venir) via la facade publique `NotificationPort` et
les délivre via AWS SES `ca-central-1` (ADR-0006).

Trois responsabilités principales :

1. **Drainage** : workers BullMQ qui rendent les templates
   `react-email` et envoient via SES (avec idempotence
   `correlationId` propagée côté SES).
2. **Feedback loop** : Lambda parse les notifications SNS bounces /
   complaints / delivery et alimente la suppression list (protège la
   réputation SES).
3. **Conformité Loi 25** : effacement cross-module via
   `EraseRecipientHistoryUseCase`, audit append-only sur 7 ans, hash
   HMAC peppered (jamais SHA-256 nu).

---

## Architecture

Suivant Principe VIII de la constitution (4 couches) :

```
interface         → AdminNotificationsController, SnsWebhookController,
                    NotificationPort (facade publique)
   ↓
application       → SendNotificationUseCase, RecordBounceUseCase,
                    RecordComplaintUseCase, EraseRecipientHistoryUseCase,
                    RemoveFromSuppressionListUseCase, RetryDeadLetterUseCase,
                    SweepRetentionUseCase, SweepExpiredSuppressionsUseCase
   ↓
domaine ←         EmailAddress, EmailLocale, EmailTemplateId,
                  NotificationEnvelope, NotificationStatus,
                  SuppressionReason, fonctions pures
                  (canonicalizeEmail, hashRecipientEmail, computeBackoff,
                  shouldSuppress, computeCircuitState,
                  priorityForEventType)
   ↑
infrastructure    → SesEmailSender, PrismaSuppressionList,
                    PrismaNotificationLog, PrismaNotificationAuditLogWriter,
                    ReactEmailRenderer, NotificationDispatchWorker (BullMQ),
                    NotificationRetentionSweepJob,
                    SuppressionListExpirationSweepJob
```

Aucun import infrastructure dans le domaine ou l'application. Tests
unitaires Vitest sur les fonctions pures avant implémentation
(TDD obligatoire — Principe VI NON-NÉGOCIABLE).

---

## Contrat public

Une seule surface exposée cross-module : **`NotificationPort`** dans
`interface/public-api/notification.port.ts`. Voir
[`contracts/notification.port.md`](../../../../../specs/003-notifications-transactionnelles/contracts/notification.port.md)
pour la signature et les garanties.

Les modules consommateurs n'importent **jamais** depuis
`apps/api/src/modules/notifications/{domain,application,infrastructure}/`
— vérifié par `tools/check-module-boundaries.ts`.

---

## Tables PostgreSQL

| Table | Rétention | Note |
|---|---|---|
| `notification_email_log` | 24 mois post-`sentAt` (anonymisé) | Trace par envoi. CHECK constraint élargie pour Loi 25. |
| `notification_suppression_list` | Permanente (hard/complaint) ou 30 j (soft) | Hash HMAC peppered, source unique de blocage envoi. |
| `notification_audit_entries` | 7 ans (append-only) | Triggers `BEFORE UPDATE/DELETE/TRUNCATE` (pattern 001). |

Détails complets :
[`data-model.md`](../../../../../specs/003-notifications-transactionnelles/data-model.md).

---

## Variables d'environnement

| Variable | Origine | Description |
|---|---|---|
| `NOTIFICATIONS_EMAIL_HASH_PEPPER` | AWS Secrets Manager (prod) / 1Password (dev) | Pepper HMAC-SHA-256 256 bits pour les hash d'emails. Pas de rotation automatique (cf. research R6). |
| `NOTIFICATIONS_SNS_HMAC_SECRET` | AWS Secrets Manager | Secret partagé Lambda ↔ NestJS pour signer les events SNS reçus. |
| `AWS_REGION` | env | `ca-central-1` (Principe II). |
| `AWS_SES_ENDPOINT` | env (dev uniquement) | LocalStack mock SES en dev. |
| `BRAND_LEGAL_NAME`, `BRAND_STREET`, etc. | env (opt) | Surcharge optionnelle de `DEFAULT_BRAND_INFO` (CASL). |

---

## Observabilité

- **Métriques OTel** (cardinality bornée 2 000 séries max — cf.
  plan.md Appendice B) :
  - `notification_email_sent_total{template_id,locale,source_module}`
  - `notification_email_delivered_total`
  - `notification_email_bounced_total{bounce_type}`
  - `notification_email_complained_total`
  - `notification_email_send_duration_seconds` (histogram)
  - `notification_email_dlq_size` (gauge)
- **Logs** Pino avec `redact.paths` exhaustif (jamais d'email en
  clair dans les logs — SC-007).
- **Dashboard** :
  [`docs/dashboards/notifications.json`](../../../../../docs/dashboards/notifications.json)
  (Grafana Cloud Canada — ADR-0003).
- **Alerting** :
  - `#ops-page` (mention `@channel`) : bounce > 5 % / 1 h, complaint
    > 0,1 % / 24 h, provider HS > 30 min, SNS events idle > 15 min.
  - `#ops-warn` (silent) : DLQ > 50.

---

## Runbooks

- `docs/runbooks/notifications-ses-production-access.md` — procédure
  de sortie SES sandbox.
- `docs/runbooks/notifications-disaster-recovery.md` — SNS HS,
  Secrets Manager HS, DNS HS.
- `docs/runbooks/notifications-bounce-investigation.md` — pic
  bounces, investigation template défaillant.

---

## Tests

```bash
# Unitaires (fonctions pures du domaine — TDD obligatoire)
pnpm --filter @cv/api test:unit -- notifications

# Intégration (Testcontainers Postgres + Redis + LocalStack SES)
pnpm --filter @cv/api test:integration -- notifications

# E2E console admin (Playwright)
pnpm --filter @cv/web test:e2e -- admin/notifications

# A11y console admin (axe-core bloquant CI — Principe XI)
pnpm --filter @cv/web test:a11y -- admin/notifications

# Frontière modulaire (Principe V)
pnpm tsx tools/check-module-boundaries.ts
```

---

## ADRs liés

- **ADR-0006** : Pivot Resend → AWS SES `ca-central-1` (résidence Loi 25).
- **ADR-0013** : Pepper hash emails notifications (à créer en
  T141 — politique non-rotative + double-pepper sur fuite).
- **ADR-0014** : Multi-tenant templates architecture (à créer en
  T142 — consolidation `packages/email-templates/`).
