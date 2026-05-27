-- Migration notification_tables_initial — feature 003 (notifications + courriel transactionnel).
--
-- Crée les 3 tables du module notifications + les 5 enums associés.
--
-- Voir specs/003-notifications-transactionnelles/data-model.md.
--
-- Conventions :
--   - UUID v4 partout en `@db.Uuid`.
--   - Tables préfixées `notification_` pour matérialiser la frontière
--     module V (cf. tools/check-module-boundaries.ts).
--   - Aucune FK transverse — pseudonymisation via `recipient_email_hash_hmac`.

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE "notification_status" AS ENUM (
  'queued',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
  'dead_letter',
  'skipped_suppressed',
  'cancelled_erased',
  'rendering_failed'
);

CREATE TYPE "notification_module" AS ENUM (
  'conformite',
  'identite',
  'intake',
  'matching',
  'facturation'
);

CREATE TYPE "suppression_reason" AS ENUM (
  'hard_bounce',
  'soft_bounce_repeated',
  'complaint',
  'manual'
);

CREATE TYPE "suppression_source" AS ENUM (
  'ses_sns_bounce',
  'ses_sns_complaint',
  'manual_admin',
  'system_auto'
);

CREATE TYPE "notification_audit_actor_role" AS ENUM ('admin', 'system');

-- ============================================================================
-- Table : notification_email_log
-- ============================================================================

CREATE TABLE "notification_email_log" (
  "id"                        UUID PRIMARY KEY,
  "correlationId"             UUID NOT NULL,
  "sourceModule"              "notification_module" NOT NULL,
  "eventType"                 VARCHAR(100) NOT NULL,
  "templateId"                VARCHAR(100) NOT NULL,
  "recipientEmailClear"       VARCHAR(254),
  "recipientEmailCanonical"   VARCHAR(254),
  "recipientEmailHashHMAC"    VARCHAR(64) NOT NULL,
  "recipientLocale"           VARCHAR(5) NOT NULL,
  "subject"                   VARCHAR(998),
  "htmlBody"                  TEXT,
  "textBody"                  TEXT,
  "status"                    "notification_status" NOT NULL,
  "attempts"                  SMALLINT NOT NULL DEFAULT 0,
  "lastError"                 TEXT,
  "nextAttemptAt"             TIMESTAMPTZ,
  "enqueuedAt"                TIMESTAMPTZ NOT NULL,
  "sentAt"                    TIMESTAMPTZ,
  "deliveredAt"               TIMESTAMPTZ,
  "bouncedAt"                 TIMESTAMPTZ,
  "complainedAt"              TIMESTAMPTZ,
  "failedAt"                  TIMESTAMPTZ,
  "erasedAt"                  TIMESTAMPTZ,
  "sesMessageId"              VARCHAR(100),
  "createdAt"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "notification_email_log_correlationId_key"
  ON "notification_email_log" ("correlationId");
CREATE UNIQUE INDEX "notification_email_log_sesMessageId_key"
  ON "notification_email_log" ("sesMessageId");

CREATE INDEX "notification_email_log_status_nextAttemptAt_idx"
  ON "notification_email_log" ("status", "nextAttemptAt");
CREATE INDEX "notification_email_log_recipientEmailHashHMAC_idx"
  ON "notification_email_log" ("recipientEmailHashHMAC");
CREATE INDEX "notification_email_log_sourceModule_eventType_enqueuedAt_idx"
  ON "notification_email_log" ("sourceModule", "eventType", "enqueuedAt");
CREATE INDEX "notification_email_log_sentAt_idx"
  ON "notification_email_log" ("sentAt");

-- ============================================================================
-- Table : notification_suppression_list
-- ============================================================================

CREATE TABLE "notification_suppression_list" (
  "id"                       UUID PRIMARY KEY,
  "recipientEmailHashHMAC"   VARCHAR(64) NOT NULL,
  "reason"                   "suppression_reason" NOT NULL,
  "source"                   "suppression_source" NOT NULL,
  "details"                  JSONB,
  "addedAt"                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expiresAt"                TIMESTAMPTZ,
  "removedAt"                TIMESTAMPTZ,
  "removedByActorId"         UUID,
  "removedReason"            TEXT
);

CREATE UNIQUE INDEX "notification_suppression_list_recipientEmailHashHMAC_key"
  ON "notification_suppression_list" ("recipientEmailHashHMAC");

CREATE INDEX "notification_suppression_list_expiresAt_idx"
  ON "notification_suppression_list" ("expiresAt");
CREATE INDEX "notification_suppression_list_reason_addedAt_idx"
  ON "notification_suppression_list" ("reason", "addedAt");

-- ============================================================================
-- Table : notification_audit_entries (append-only — triggers en T009)
-- ============================================================================

CREATE TABLE "notification_audit_entries" (
  "id"                    UUID PRIMARY KEY,
  "eventType"             VARCHAR(120) NOT NULL,
  "actorId"               UUID NOT NULL,
  "actorRole"             "notification_audit_actor_role" NOT NULL,
  "targetEmailHashHMAC"   VARCHAR(64),
  "reason"                TEXT,
  "metadata"              JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurredAt"            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "notification_audit_entries_eventType_occurredAt_idx"
  ON "notification_audit_entries" ("eventType", "occurredAt");
CREATE INDEX "notification_audit_entries_targetEmailHashHMAC_idx"
  ON "notification_audit_entries" ("targetEmailHashHMAC");
CREATE INDEX "notification_audit_entries_actorId_occurredAt_idx"
  ON "notification_audit_entries" ("actorId", "occurredAt");

-- Note : les triggers append-only sont posés par la migration suivante
-- 20260528000001_notification_audit_block_modifications pour rester
-- modulaire et explicite (pattern hérité de feature 001).
