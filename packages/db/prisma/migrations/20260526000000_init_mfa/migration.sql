-- Migration init_mfa — feature 005 (MFA conseiller, Principe IX NON-NÉGOCIABLE)
--
-- Crée les 5 tables et 5 enums du module MFA + 2 index partiels Postgres
-- (P0-3 scoping session, P0-4 unicité du secret enabled).
--
-- Cf. specs/005-mfa-conseiller/data-model.md.
-- Cf. ADR-0010 (chiffrement AES-256-GCM du secret TOTP).

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------

CREATE TYPE "MfaSecretKind" AS ENUM ('totp');

CREATE TYPE "MfaEventType" AS ENUM (
    'mfa_enrollment_started',
    'mfa_enrolled',
    'mfa_enrollment_cancelled',
    'mfa_login_verified',
    'mfa_login_failed',
    'mfa_login_locked',
    'mfa_login_unlocked',
    'mfa_stepup_verified',
    'mfa_stepup_failed',
    'mfa_stepup_session_killed',
    'mfa_backup_code_consumed',
    'mfa_backup_codes_regenerated_self',
    'mfa_backup_codes_warning_low',
    'mfa_device_changed_self',
    'mfa_reset_by_admin',
    'mfa_secret_anonymized'
);

CREATE TYPE "MfaVerifyMethod" AS ENUM ('totp', 'backup_code');

CREATE TYPE "MfaRateLimitKind" AS ENUM (
    'login_totp',
    'stepup_totp',
    'enroll_start',
    'device_change'
);

CREATE TYPE "MfaEmailTemplateKind" AS ENUM (
    'login_locked',
    'stepup_session_killed',
    'admin_reset',
    'device_changed',
    'device_change_incomplete'
);

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

CREATE TABLE "mfa_secrets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "MfaSecretKind" NOT NULL DEFAULT 'totp',
    "encryptedSecret" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabledAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "enrollmentRequestId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mfa_secrets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mfa_backup_codes" (
    "id" UUID NOT NULL,
    "mfaSecretId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "batchId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_backup_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mfa_audit_events" (
    "id" UUID NOT NULL,
    "eventType" "MfaEventType" NOT NULL,
    "actorUserId" UUID,
    "targetUserId" UUID,
    "targetRole" "AuthRole",
    "actorIp" VARCHAR(45),
    "method" "MfaVerifyMethod",
    "justification" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mfa_rate_limit_buckets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "MfaRateLimitKind" NOT NULL,
    "sessionId" UUID,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowEndsAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mfa_rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mfa_outbox_emails" (
    "id" UUID NOT NULL,
    "recipientUserId" UUID NOT NULL,
    "templateKind" "MfaEmailTemplateKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "mfa_outbox_emails_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------
-- 3. Index B-tree standard (générés par Prisma à partir des @@index)
-- ---------------------------------------------------------------------

CREATE UNIQUE INDEX "mfa_secrets_enrollmentRequestId_key"
    ON "mfa_secrets"("enrollmentRequestId");

CREATE INDEX "mfa_secrets_userId_idx"
    ON "mfa_secrets"("userId");

CREATE INDEX "mfa_backup_codes_batchId_idx"
    ON "mfa_backup_codes"("batchId");

CREATE INDEX "mfa_backup_codes_mfaSecretId_usedAt_idx"
    ON "mfa_backup_codes"("mfaSecretId", "usedAt");

CREATE UNIQUE INDEX "mfa_backup_codes_mfaSecretId_batchId_position_key"
    ON "mfa_backup_codes"("mfaSecretId", "batchId", "position");

CREATE INDEX "mfa_audit_events_targetUserId_occurredAt_idx"
    ON "mfa_audit_events"("targetUserId", "occurredAt");

CREATE INDEX "mfa_audit_events_actorUserId_occurredAt_idx"
    ON "mfa_audit_events"("actorUserId", "occurredAt");

CREATE INDEX "mfa_audit_events_eventType_occurredAt_idx"
    ON "mfa_audit_events"("eventType", "occurredAt");

CREATE INDEX "mfa_rate_limit_buckets_windowEndsAt_idx"
    ON "mfa_rate_limit_buckets"("windowEndsAt");

CREATE INDEX "mfa_rate_limit_buckets_userId_kind_idx"
    ON "mfa_rate_limit_buckets"("userId", "kind");

CREATE INDEX "mfa_outbox_emails_sentAt_queuedAt_idx"
    ON "mfa_outbox_emails"("sentAt", "queuedAt");

CREATE INDEX "mfa_outbox_emails_recipientUserId_idx"
    ON "mfa_outbox_emails"("recipientUserId");

-- ---------------------------------------------------------------------
-- 4. Index UNIQUES PARTIELS Postgres (P0-3, P0-4 du review)
-- ---------------------------------------------------------------------

-- P0-4 — Au plus un MfaSecret enabled par user.
-- L'index ne contraint que les lignes `enabledAt IS NOT NULL`, donc
-- plusieurs secrets pending (enabledAt = NULL) peuvent coexister
-- transitoirement pendant la sémantique supersede (P0-1).
CREATE UNIQUE INDEX "mfa_secrets_one_enabled_per_user"
    ON "mfa_secrets"("userId")
    WHERE "enabledAt" IS NOT NULL;

-- P0-3 — Scoping du bucket de rate limit selon sessionId.
-- Postgres traite chaque NULL comme distinct, donc on ne peut pas
-- utiliser un @@unique([userId, kind, sessionId]) Prisma standard
-- avec sessionId nullable. On découpe en 2 index partiels :
--   - 1 bucket par (userId, kind, sessionId) pour les types
--     scope-session (stepup_totp)
--   - 1 bucket par (userId, kind) pour les types scope-user
--     (login_totp, enroll_start, device_change)
CREATE UNIQUE INDEX "mfa_rate_limit_buckets_per_session"
    ON "mfa_rate_limit_buckets"("userId", "kind", "sessionId")
    WHERE "sessionId" IS NOT NULL;

CREATE UNIQUE INDEX "mfa_rate_limit_buckets_per_user"
    ON "mfa_rate_limit_buckets"("userId", "kind")
    WHERE "sessionId" IS NULL;

-- ---------------------------------------------------------------------
-- 5. Foreign keys
-- ---------------------------------------------------------------------

ALTER TABLE "mfa_secrets"
    ADD CONSTRAINT "mfa_secrets_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "auth_users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mfa_backup_codes"
    ADD CONSTRAINT "mfa_backup_codes_mfaSecretId_fkey"
    FOREIGN KEY ("mfaSecretId") REFERENCES "mfa_secrets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mfa_audit_events"
    ADD CONSTRAINT "mfa_audit_events_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "auth_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mfa_audit_events"
    ADD CONSTRAINT "mfa_audit_events_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "auth_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "mfa_outbox_emails"
    ADD CONSTRAINT "mfa_outbox_emails_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "auth_users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
