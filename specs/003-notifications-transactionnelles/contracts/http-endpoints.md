# HTTP Endpoints : Notifications module

**Branche** : `003-notifications-transactionnelles`
**Base path** : `/api/admin/notifications` (admin console) +
`/api/internal/notifications/sns` (interne, signé HMAC)

Toutes les routes admin sont gardées par `RoleGuard('admin')` +
`MfaSessionGuard` (héritage 002/002a). Toutes les mutations exigent un
`Idempotency-Key: <uuid-v4>` (Principe X).

Validation Zod côté serveur sur tous les payloads (Principe IX).

---

## Endpoints admin (console US6)

### 1. `GET /api/admin/notifications/suppression-list`

Liste paginée et filtrable de la suppression list.

**Auth** : `admin` + MFA actif.

**Query params** (validation `SuppressionListQuerySchema`) :
- `reason` : `'hard_bounce' | 'soft_bounce_repeated' | 'complaint' | 'manual'` (optionnel)
- `page` : `number ≥ 1` (défaut 1)
- `pageSize` : `number entre 1 et 50` (défaut 20)

**Réponse 200** :
```json
{
  "items": [
    {
      "id": "uuid",
      "emailHashHMAC": "a1b2c3...",
      "reason": "hard_bounce",
      "source": "ses_sns_bounce",
      "addedAt": "2026-05-26T14:32:00.000Z",
      "expiresAt": null,
      "details": { "bounceType": "Permanent", "bounceSubType": "General" }
    }
  ],
  "totalCount": 47,
  "page": 1,
  "pageSize": 20
}
```

**Réponse 400** : Zod validation error sur query.

---

### 2. `POST /api/admin/notifications/suppression-list/:id/remove`

Retrait manuel d'une adresse de la suppression list.

**Auth** : `admin` + MFA actif.

**Path param** : `id` (uuid de l'entrée).

**Headers** : `Idempotency-Key: <uuid-v4>` obligatoire.

**Body** (validation `RemoveFromSuppressionListSchema`) :
```json
{
  "reason": "Faux positif confirmé — conseiller a contacté le support, boîte mail opérationnelle (test envoi manuel OK)."
}
```
- `reason` : `string, min 10, max 1000` (FR-028 motif obligatoire).

**Réponse 200** :
```json
{ "removed": true, "removedAt": "2026-05-26T14:45:00.000Z" }
```

**Réponse 404** : entry introuvable.

**Réponse 409** : entry déjà retirée (`removedAt` non-null).

**Side effects** :
- Update `notification_suppression_list` : `removedAt = now()`,
  `removedByActorId = currentUser.id`, `removedReason = body.reason`.
- Insert `notification_audit_entries` :
  `eventType = 'notification.suppression.removed_manual'`.

---

### 3. `GET /api/admin/notifications/dead-letter`

Liste paginée des entries en dead-letter (`status = 'dead_letter'`).

**Auth** : `admin` + MFA actif.

**Query params** : `page`, `pageSize`, `sourceModule` (optionnel).

**Réponse 200** :
```json
{
  "items": [
    {
      "id": "uuid",
      "correlationId": "uuid",
      "sourceModule": "identite",
      "eventType": "auth.email_verification",
      "templateId": "auth.email-verification",
      "emailHashHMAC": "abc...",
      "attempts": 5,
      "lastError": "AWS SES throttled: Sending rate exceeded",
      "enqueuedAt": "2026-05-25T10:00:00.000Z",
      "failedAt": "2026-05-26T10:00:00.000Z"
    }
  ],
  "totalCount": 3,
  "page": 1,
  "pageSize": 20
}
```

---

### 4. `POST /api/admin/notifications/dead-letter/:id/retry`

Relance manuelle d'une entry en dead-letter.

**Auth** : `admin` + MFA actif.

**Path param** : `id` (uuid de `notification_email_log` entry).

**Headers** : `Idempotency-Key` obligatoire.

**Body** (validation `RetryDeadLetterSchema`) :
```json
{
  "reason": "Quota SES augmenté ce matin — replay safe maintenant."
}
```
- `reason` : `string, min 10, max 1000` (FR-029 motif obligatoire).

**Réponse 200** :
```json
{ "retried": true, "newJobId": "bullmq-job-id" }
```

**Réponse 404** : entry introuvable.

**Réponse 409** : entry pas en `dead_letter` (état déjà passé à `delivered`).

**Side effects** :
- Update `notification_email_log` : `status = 'queued'`, `attempts = 0`,
  `nextAttemptAt = now()`, `lastError = null`.
- Enqueue BullMQ : nouveau job pour le worker `notification-dispatch`.
- Insert `notification_audit_entries` :
  `eventType = 'notification.dead_letter.retried_manual'`.

---

### 5. `GET /api/admin/notifications/log/:correlationId`

Détail d'un envoi par `correlationId` (utile pour debug support).

**Auth** : `admin` + MFA actif.

**Réponse 200** : row complète `notification_email_log` sauf les
colonnes PII si `erasedAt` non-null (renvoyées à `null` dans la
réponse).

```json
{
  "id": "uuid",
  "correlationId": "uuid",
  "sourceModule": "conformite",
  "eventType": "conformite.dossier_approved",
  "templateId": "conformite.dossier-approved",
  "recipientEmailClear": null,            // null si erasedAt
  "recipientEmailHashHMAC": "abc...",
  "recipientLocale": "fr-CA",
  "subject": null,                        // null si erasedAt
  "status": "delivered",
  "attempts": 1,
  "lastError": null,
  "enqueuedAt": "2026-05-26T10:00:00.000Z",
  "sentAt": "2026-05-26T10:00:01.124Z",
  "deliveredAt": "2026-05-26T10:00:18.890Z",
  "bouncedAt": null,
  "complainedAt": null,
  "failedAt": null,
  "erasedAt": null,
  "sesMessageId": "0100018f...."
}
```

**Réponse 404** : `correlationId` introuvable.

---

### 6. `GET /api/admin/notifications/audit`

Liste paginée du journal d'audit (cursor-based).

**Auth** : `admin` + MFA actif.

**Query params** (validation similaire 001 audit) :
- `cursor` : uuid (optionnel, paginate après cet id)
- `pageSize` : `1..50` (défaut 20)
- `eventType` : optionnel (filtre)
- `actorId` : optionnel (filtre)

**Réponse 200** :
```json
{
  "items": [
    {
      "id": "uuid",
      "eventType": "notification.suppression.removed_manual",
      "actorId": "uuid",
      "actorRole": "admin",
      "targetEmailHashHMAC": "abc...",
      "reason": "Faux positif confirmé...",
      "occurredAt": "2026-05-26T14:45:00.000Z",
      "metadata": {}
    }
  ],
  "nextCursor": "uuid-or-null"
}
```

---

### 7. `GET /api/admin/notifications/metrics/snapshot`

Snapshot des métriques de délivrabilité 24 h (utilisé par le dashboard
admin pour affichage temps réel — les métriques OTel restent canoniques
dans Grafana).

**Auth** : `admin` (pas de MFA exigé — read-only non sensible).

**Réponse 200** :
```json
{
  "windowHours": 24,
  "computedAt": "2026-05-26T15:00:00.000Z",
  "sent": 4823,
  "delivered": 4731,
  "bounced": { "total": 67, "hard": 12, "soft": 55 },
  "complained": 2,
  "failed": 23,
  "deadLetter": 3,
  "deliveryRate": 0.9809,
  "bounceRate": 0.0139,
  "complaintRate": 0.0004,
  "topTemplatesByBounceRate": [
    { "templateId": "auth.email-verification", "bounces": 8, "sent": 1200, "rate": 0.0067 }
  ]
}
```

---

## Endpoint interne (signé HMAC, appelé par Lambda)

### 8. `POST /api/internal/notifications/sns`

Reçoit les notifications SES via Lambda (cf. research R5).

**Auth** : signature HMAC `X-CV-Sns-Signature: sha256=<hex>` calculée
par la Lambda avec le secret partagé `NOTIFICATIONS_SNS_HMAC_SECRET`
sur le body brut. **Aucune session admin requise** — c'est un endpoint
machine-to-machine signé.

**Body** (Zod `SnsForwardedEventSchema` — cf.
`contracts/sns-event-schema.md` pour détails) :

```json
{
  "schemaVersion": 1,
  "eventType": "Bounce",
  "sesMessageId": "0100018f...",
  "occurredAt": "2026-05-26T10:01:00.000Z",
  "recipientEmail": "user@example.com",
  "details": {
    "bounceType": "Permanent",
    "bounceSubType": "General",
    "diagnosticCode": "smtp; 550 5.1.1 The email account that you tried to reach does not exist."
  }
}
```

**Réponse 200** :
```json
{ "processed": true }
```

**Réponse 401** : signature invalide.

**Réponse 200 (idempotence)** : si `sesMessageId` + `eventType` déjà
traité (idempotence via composite key), retourne `{ processed: true, duplicate: true }`.

**Side effects selon `eventType`** :
- `Bounce` (hard) : update `notification_email_log` row → `status = 'bounced'`,
  `bouncedAt = occurredAt`. Insert `notification_suppression_list` permanent
  + audit `notification.suppression.added_auto`.
- `Bounce` (soft) : update `notification_email_log` row → `status = 'bounced'`,
  `bouncedAt = occurredAt`. Si > 3 soft bounces sur 30 j pour ce hash,
  upsert `notification_suppression_list` avec `expiresAt = now() + 30 days`.
- `Complaint` : update `notification_email_log` → `status = 'complained'`.
  Insert `notification_suppression_list` permanent + audit.
- `Delivery` : update `notification_email_log` → `status = 'delivered'`,
  `deliveredAt = occurredAt`. Pas de side-effect sur suppression.

---

## Considérations transversales

### Idempotency-Key

Pour les mutations admin (endpoints 2 et 4), header
`Idempotency-Key: <uuid-v4>` obligatoire. Stocké dans une table
existante (cf. convention 001 `idempotency_keys` ou pattern Redis 7 j).
À arbitrer dans tasks — utiliser le pattern existant de 001 si déjà
en place.

### Limites de taux

- 100 requêtes/min/IP sur les endpoints `GET` (lecture admin).
- 30 requêtes/min/IP sur les endpoints `POST` (mutations admin).
- Endpoint SNS : pas de rate-limit (déjà filtré par Lambda + HMAC).

### En-têtes de sécurité

Hérités du middleware Fastify global (CSP, HSTS, X-Content-Type-Options,
Referrer-Policy, Permissions-Policy). Cf. Principe IX constitution.

### Versioning d'API

J1 : routes sans préfixe de version (`/api/admin/notifications/...`).
Si un changement breaking devait survenir, ajouter `/api/v2/admin/...`
selon politique constitutionnelle (cf. constitution section
*Décisions architecturales*).
