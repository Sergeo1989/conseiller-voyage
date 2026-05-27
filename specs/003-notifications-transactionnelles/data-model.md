# Data Model : Notifications et courriel transactionnel

**Branche** : `003-notifications-transactionnelles`
**Date** : 2026-05-26
**Spec** : [spec.md](./spec.md)
**Plan** : [plan.md](./plan.md)
**Research** : [research.md](./research.md)

Ce document définit les entités persistées par le module
`notifications`, leurs schémas Prisma, leurs invariants, et leurs
relations. Trois nouvelles tables PostgreSQL sont introduites. Aucune
modification de schéma sur les tables des modules existants (chaque
module source garde son outbox tel quel).

---

## Vue d'ensemble des entités

| Entité | Table Prisma | Module propriétaire | Rétention |
|---|---|---|---|
| `NotificationLogEntry` | `notification_email_log` | `notifications` | 24 mois post-`sentAt` |
| `SuppressionListEntry` | `notification_suppression_list` | `notifications` | Permanente (hard bounce, complaint) ou 30 j (soft bounce) |
| `NotificationAuditEntry` | `notification_audit_entries` | `notifications` | 7 ans (append-only, immuable) |

---

## 1. `NotificationLogEntry` (`notification_email_log`)

Trace de chaque tentative d'envoi de courriel. Une row par
`correlationId` (idempotence stricte).

### Schéma Prisma

```prisma
model NotificationLogEntry {
  id                     String              @id @default(uuid()) @db.Uuid
  correlationId          String              @unique @db.Uuid              // = outbox entry.id du module source
  sourceModule           NotificationModule
  eventType              String              @db.VarChar(100)              // ex: 'auth.email_verification'
  templateId             String              @db.VarChar(100)              // ex: 'auth.email-verification'

  // Destinataire — soumis à effacement Loi 25 (US5 / FR-022)
  recipientEmailClear    String?             @db.VarChar(254)              // null après effacement
  recipientEmailCanonical String?            @db.VarChar(254)              // null après effacement (forme post-canonicalizeEmail)
  recipientEmailHashHMAC String              @db.VarChar(64)               // permanent — sert audit anti-resoumission
  recipientLocale        String              @db.VarChar(5)                // 'fr-CA' | 'en'

  // Contenu rendu — soumis à effacement Loi 25
  subject                String?             @db.VarChar(998)              // RFC 5322 limit, null après effacement
  htmlBody               String?             @db.Text                      // null après effacement
  textBody               String?             @db.Text                      // null après effacement

  // État
  status                 NotificationStatus
  attempts               Int                 @default(0) @db.SmallInt
  lastError              String?             @db.Text
  nextAttemptAt          DateTime?           @db.Timestamptz(6)

  // Horodatages
  enqueuedAt             DateTime            @db.Timestamptz(6)            // copié depuis envelope.enqueuedAt
  sentAt                 DateTime?           @db.Timestamptz(6)            // SES accepté
  deliveredAt            DateTime?           @db.Timestamptz(6)            // SNS Delivery
  bouncedAt              DateTime?           @db.Timestamptz(6)
  complainedAt           DateTime?           @db.Timestamptz(6)
  failedAt               DateTime?           @db.Timestamptz(6)            // exhaustion retries
  erasedAt               DateTime?           @db.Timestamptz(6)            // Loi 25 effacement

  // SES tracking
  sesMessageId           String?             @unique @db.VarChar(100)      // retourné par SES, corrèle SNS events

  createdAt              DateTime            @default(now()) @db.Timestamptz(6)
  updatedAt              DateTime            @updatedAt @db.Timestamptz(6)

  @@index([status, nextAttemptAt])                                          // worker scan
  @@index([recipientEmailHashHMAC])                                         // erasure lookup
  @@index([sourceModule, eventType, enqueuedAt])                            // metrics + admin filter
  @@index([sentAt])                                                         // retention sweep
  @@map("notification_email_log")
}

enum NotificationStatus {
  queued                 // dans BullMQ, pas encore envoyé
  sent                   // accepté par SES
  delivered              // confirmé par SNS Delivery
  bounced                // bounce hard ou soft post-delivery
  complained             // complaint reçu via SNS
  failed                 // échec dispatch (transient)
  dead_letter            // 5 tentatives épuisées
  skipped_suppressed     // adresse en suppression list au moment de l'envoi
  cancelled_erased       // effacement Loi 25 demandé avant envoi
  rendering_failed       // erreur de rendu template (data invalides)
}

enum NotificationModule {
  conformite
  identite
  intake
  matching
  facturation
}
```

### Invariants

1. `correlationId` est **unique** — l'idempotence est appliquée au
   niveau Postgres. Tentative d'insert avec un `correlationId` existant
   = no-op (catch P2002, log debug).
2. `recipientEmailHashHMAC` est **toujours** présent, même après
   effacement Loi 25 (sert l'audit anti-resoumission cohérent avec
   suppression list).
3. `sesMessageId` n'est posé **qu'après** acceptation SES (status passe
   `queued → sent`).
4. Transitions d'état autorisées :
   ```
   queued → sent → delivered
                 ↓
                 → bounced
                 → complained
   queued → failed (transient) → queued (retry)
   queued → failed → dead_letter (après 5 attempts)
   queued → skipped_suppressed
   queued → cancelled_erased
   queued → rendering_failed
   ```
   Pas de retour en arrière (DAG). Une row qui atteint `delivered`,
   `bounced`, `complained`, `dead_letter`, `skipped_suppressed`,
   `cancelled_erased` ou `rendering_failed` est en état final.
5. `erasedAt` non-null implique `recipientEmailClear = null` ET
   `subject = null` ET `htmlBody = null` ET `textBody = null` ET
   `recipientEmailCanonical = null` (vérifié par CHECK constraint
   Postgres ajouté en migration).
6. `recipientEmailHashHMAC` reste **NOT NULL** indépendamment de
   `erasedAt` (audit anti-resoumission Loi 25). La CHECK constraint
   vérifie aussi `erasedAt IS NULL OR recipientEmailHashHMAC IS NOT NULL`
   pour empêcher tout bug applicatif qui nullerait le hash.

### Retention

- À T+24 mois de `sentAt`, si pas déjà `erasedAt`, un job mensuel
  (`NotificationRetentionSweepJob`) déclenche l'anonymisation
  (clear/canonical/subject/body → null, set `erasedAt`).
- Conservation indéfinie post-anonymisation pour audit comptable, car
  les champs identifiants (`recipientEmailClear` etc.) sont déjà null.

---

## 2. `SuppressionListEntry` (`notification_suppression_list`)

Adresses pour lesquelles aucun courriel ne doit plus être envoyé.

### Schéma Prisma

```prisma
model SuppressionListEntry {
  id                     String                  @id @default(uuid()) @db.Uuid
  recipientEmailHashHMAC String                  @unique @db.VarChar(64)   // clé canonique
  reason                 SuppressionReason
  source                 SuppressionSource
  details                Json?                                              // payload spécifique : bounceType, complaintFeedbackType, etc.
  addedAt                DateTime                @default(now()) @db.Timestamptz(6)
  expiresAt              DateTime?               @db.Timestamptz(6)         // null = permanent (hard bounce, complaint, manual permanent)
  removedAt              DateTime?               @db.Timestamptz(6)         // soft-delete pour audit (vrai DELETE jamais utilisé)
  removedByActorId       String?                 @db.Uuid                   // admin qui a retiré manuellement
  removedReason          String?                 @db.Text                   // motif libre obligatoire au retrait manuel

  @@index([expiresAt])                                                       // job de purge soft bounces périmés
  @@index([reason, addedAt])                                                 // admin browse
  @@map("notification_suppression_list")
}

enum SuppressionReason {
  hard_bounce               // permanent (boîte inexistante, domaine HS définitif)
  soft_bounce_repeated      // soft bounces successifs → suppression 30 j
  complaint                 // permanent (utilisateur a marqué spam)
  manual                    // ajouté par un opérateur
}

enum SuppressionSource {
  ses_sns_bounce
  ses_sns_complaint
  manual_admin
  system_auto
}
```

### Invariants

1. `recipientEmailHashHMAC` est **unique** — un email n'est listé
   qu'une seule fois (le retrait est un soft-delete via `removedAt`).
2. `expiresAt = null` si `reason ∈ { hard_bounce, complaint, manual }`
   et `permanent` (le retrait manuel admin peut être permanent).
3. `expiresAt` non-null **uniquement** pour `soft_bounce_repeated`
   (= `addedAt + 30 jours`). Job quotidien purge `WHERE expiresAt < now()
   AND removedAt IS NULL` en mettant `removedAt = now()` avec `removedReason = 'expired_soft_bounce'`.
4. `removedAt` non-null + `removedReason` obligatoire (CHECK
   constraint Postgres).
5. Toute modification de cette table émet une `NotificationAuditEntry`
   correspondante.

### Lookup pattern

Avant chaque envoi :

```ts
const hash = hashRecipientEmail(canonicalEmail, pepper);
const entry = await prisma.suppressionListEntry.findUnique({
  where: { recipientEmailHashHMAC: hash },
});
if (entry && entry.removedAt === null && (entry.expiresAt === null || entry.expiresAt > now)) {
  // Suppress this send
  return { suppressed: true, reason: entry.reason };
}
```

---

## 3. `NotificationAuditEntry` (`notification_audit_entries`)

Journal append-only de toutes les actions critiques (humaines ou
automatiques) sur le module notifications. Schéma directement
inspiré de `conformite_audit_entries` (Principe V — pas de réutilisation
cross-module, pattern dupliqué pour isolation).

### Schéma Prisma

```prisma
model NotificationAuditEntry {
  id                     String                          @id @default(uuid()) @db.Uuid
  eventType              String                          @db.VarChar(120)             // ex: 'notification.suppression.removed_manually'
  actorId                String                          @db.Uuid                     // user.id (admin) ou UUID systémique
  actorRole              NotificationAuditActorRole
  targetEmailHashHMAC    String?                         @db.VarChar(64)              // hash de l'adresse concernée (null si l'event n'est pas lié à un destinataire)
  reason                 String?                         @db.Text                     // motif libre obligatoire pour actions humaines sensibles
  metadata               Json                            @default("{}")
  occurredAt             DateTime                        @default(now()) @db.Timestamptz(6)

  @@index([eventType, occurredAt])
  @@index([targetEmailHashHMAC])
  @@index([actorId, occurredAt])
  @@map("notification_audit_entries")
}

enum NotificationAuditActorRole {
  admin
  system
}
```

### Migration SQL additionnelle (triggers append-only)

Deux triggers Postgres bruts pour bloquer UPDATE/DELETE/TRUNCATE
(pattern hérité de 001 conformité — leçon `20260525170000_audit_block_truncate`) :

```sql
-- Migration: 20260526NNNNNN_notification_audit_block_modifications

CREATE OR REPLACE FUNCTION notification_audit_block_modifications()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'notification_audit_entries is append-only — modifications forbidden';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notification_audit_block_updates
  BEFORE UPDATE OR DELETE ON notification_audit_entries
  FOR EACH ROW
  EXECUTE FUNCTION notification_audit_block_modifications();

CREATE TRIGGER trg_notification_audit_block_truncate
  BEFORE TRUNCATE ON notification_audit_entries
  FOR EACH STATEMENT
  EXECUTE FUNCTION notification_audit_block_modifications();

COMMENT ON TRIGGER trg_notification_audit_block_updates ON notification_audit_entries
  IS 'Defense en profondeur Loi 25 / audit : empêche UPDATE/DELETE row-level.';

COMMENT ON TRIGGER trg_notification_audit_block_truncate ON notification_audit_entries
  IS 'Defense en profondeur Loi 25 / audit : empêche TRUNCATE statement-level. Cf. ADR-0012.';
```

### Types d'événements audités

| `eventType` | Acteur | Trigger | `reason` requis |
|---|---|---|---|
| `notification.dispatched` | system | Worker envoie un courriel (status `sent`) | non |
| `notification.delivered` | system | SNS Delivery reçu | non |
| `notification.bounced` | system | SNS Bounce reçu | non (raison dans `metadata`) |
| `notification.complained` | system | SNS Complaint reçu | non |
| `notification.dead_lettered` | system | 5 tentatives épuisées | non |
| `notification.suppression.added_auto` | system | Ajout auto suite à bounce/complaint | non |
| `notification.suppression.added_manual` | admin | Ajout manuel (cas rare, prévu mais non exposé UI J1) | oui |
| `notification.suppression.removed_manual` | admin | Retrait manuel via console US6 | **oui** (FR-028) |
| `notification.suppression.expired` | system | Soft bounce TTL atteint, purge auto | non |
| `notification.dead_letter.retried_manual` | admin | Retry manuel via console US6 | **oui** (FR-029) |
| `notification.recipient_history.erased` | system | Effacement Loi 25 effectué | non |

---

## 4. Tables des modules sources — RÉFÉRENCÉES + modifications mineures

Pour contexte uniquement. Le module notifications **n'accède pas** à
ces tables directement (Principe V). Chaque module source possède son
propre worker qui les lit. Détails complets et mapping vers
`NotificationEnvelope` dans
[`contracts/outbox-source-contract.md`](./contracts/outbox-source-contract.md).

⚠️ **Les 3 schémas réels divergent** sur les noms de colonnes (rappel
résumé) :

| Table | Module | Champs réels-clés | Modification 003 |
|---|---|---|---|
| `conformite_outbox` | conformite (001) | `eventType: String`, `publishedAt`, `nextAttemptAt`, payload JSON (contient `recipientEmail`) | OutboxPublisherJob existant **modifié** pour appeler `NotificationPort.send()`. Audit du payload pour garantir `recipientEmail` rempli. |
| `auth_outbox_emails` | identite (002) | `recipientEmail` (colonne), `templateKind: AuthEmailTemplate` (enum), `sentAt`, FK `recipientUser → AuthUser` | **Migration expand** : ajout `next_attempt_at TIMESTAMPTZ NULL` + index partiel. Création worker `AuthOutboxDispatchWorker`. |
| `mfa_outbox_emails` | identite (002a) | `recipientUserId` (FK NOT NULL), `templateKind: MfaEmailTemplateKind` (enum), `queuedAt`, `sentAt` (PAS de `recipientEmail` colonne — récupéré via FK in-module) | **Migration expand** : ajout `next_attempt_at TIMESTAMPTZ NULL` + index partiel. Création worker `MfaOutboxDispatchWorker`. |

Les **migrations expand** auth + mfa sont compatibles backward
(colonnes nullables ajoutées, ne cassent pas le code 002/002a
existant qui les ignore). Listées en section 7 ci-dessous.

---

## 5. Relations entre tables

```text
notification_email_log
        │
        ├─── (corrélation logique via recipientEmailHashHMAC) ───→ notification_suppression_list
        │
        └─── (corrélation logique via correlationId / targetEmailHashHMAC) ─→ notification_audit_entries

Aucune foreign key entre ces tables (Principe Loi 25 ADR-0012 hérité
de 001 : pas de FK transverse au log d'audit pour permettre
l'effacement par anonymisation sans corruption référentielle).
```

---

## 6. Validation Zod (au niveau application / port)

```ts
// packages/shared/src/notifications/envelope.schema.ts
// (cf. research R2)

// packages/shared/src/notifications/admin-actions.schema.ts
export const RemoveFromSuppressionListSchema = z.object({
  emailHashHMAC: z.string().regex(/^[0-9a-f]{64}$/),
  reason: z.string().min(10).max(1000),
}).strict();

export const RetryDeadLetterSchema = z.object({
  notificationLogEntryId: z.string().uuid(),
  reason: z.string().min(10).max(1000),
}).strict();

export const SuppressionListQuerySchema = z.object({
  reason: z.enum(['hard_bounce', 'soft_bounce_repeated', 'complaint', 'manual']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
```

---

## 7. Migrations Prisma — liste prévisionnelle

| # | Fichier | Contenu |
|---|---|---|
| 1 | `2026MMDDNNNNNN_notification_tables_initial` | Création `notification_email_log`, `notification_suppression_list`, `notification_audit_entries` + enums |
| 2 | `2026MMDDNNNNNN_notification_audit_block_modifications` | Triggers append-only (UPDATE/DELETE/TRUNCATE) sur `notification_audit_entries` |
| 3 | `2026MMDDNNNNNN_notification_email_log_erasure_check` | `ALTER TABLE notification_email_log ADD CONSTRAINT chk_erased_implies_null_pii_and_hash_kept CHECK ((erasedAt IS NULL OR (recipientEmailClear IS NULL AND recipientEmailCanonical IS NULL AND subject IS NULL AND htmlBody IS NULL AND textBody IS NULL)) AND (erasedAt IS NULL OR recipientEmailHashHMAC IS NOT NULL))` |
| 4 | `2026MMDDNNNNNN_outbox_add_next_attempt_at` | `ALTER TABLE auth_outbox_emails ADD COLUMN next_attempt_at TIMESTAMPTZ NULL; ALTER TABLE mfa_outbox_emails ADD COLUMN next_attempt_at TIMESTAMPTZ NULL;` + index partiels sur `(sent_at, next_attempt_at) WHERE sent_at IS NULL` (expand-compatible, ne casse pas 002/002a) |

Forward-only (constitution). Pas de migration destructive. Migration
appliquée d'abord en staging, validée 24 h avant prod.

---

## 8. Index strategy

- `notification_email_log` :
  - `(status, nextAttemptAt)` → scan worker (entries pending retry).
  - `(recipientEmailHashHMAC)` → lookup pour effacement Loi 25 et
    cohérence pré-envoi.
  - `(sourceModule, eventType, enqueuedAt)` → métriques OTel +
    filtres admin.
  - `(sentAt)` → job retention sweep mensuel.
- `notification_suppression_list` :
  - PK + unique sur `recipientEmailHashHMAC` (auto-créé par
    `@unique`).
  - `(expiresAt)` → job de purge soft bounces.
  - `(reason, addedAt)` → tri/filtre console admin.
- `notification_audit_entries` :
  - `(eventType, occurredAt)` → recherche par type d'event.
  - `(targetEmailHashHMAC)` → recherche par destinataire (Loi 25
    audit).
  - `(actorId, occurredAt)` → trace de toutes les actions d'un admin.

---

## 9. Estimation de volume (M18 cible)

| Table | Volume J+1 an | Volume M18 (cible) | Notes |
|---|---|---|---|
| `notification_email_log` | ~1,5 M rows | ~2,3 M rows | 5 k/jour × 365 j × 1,25 (anciennes outbox replay) |
| `notification_suppression_list` | ~50 K rows | ~75 K rows | Estimation 3 % bounce + 0,05 % complaint sur volume cumulé |
| `notification_audit_entries` | ~3 M rows | ~4,5 M rows | 1 row par event SES + 1 row par action admin |

Sur 7 ans (rétention max), `notification_audit_entries` ≈ 30 M rows.
Acceptable pour Postgres simple (pas de partitioning nécessaire J1).
Indexation suffisante via les index listés. **Partitioning by month**
peut être introduit si > 100 M rows (estimation 24+ mois après
launch).
