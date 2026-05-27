-- Migration init_auth_credentials — feature 002 (auth conseiller + admin).
--
-- Étend le schéma Auth.js v5 (auth.prisma) avec :
--   - colonne password_hash sur auth_accounts (bcrypt cost 11 sur SHA-256 prehash)
--   - 6 nouvelles tables : tokens (email verif / password reset / admin invite),
--     audit immuable, lockout buckets, outbox courriel
--
-- Voir specs/006-auth-conseiller-admin/data-model.md.

-- ============================================================================
-- Enums
-- ============================================================================

-- CreateEnum
CREATE TYPE "AuthAuditEventType" AS ENUM ('signup', 'email_verified', 'login_success', 'login_failed', 'login_locked', 'logout', 'password_reset_requested', 'password_reset_completed', 'password_changed_self', 'password_change_failed', 'admin_bootstrap', 'admin_invitation_sent', 'admin_invitation_consumed', 'admin_created_by_admin');

-- CreateEnum
CREATE TYPE "LoginLockoutKind" AS ENUM ('login_account', 'login_ip');

-- CreateEnum
CREATE TYPE "AuthEmailTemplate" AS ENUM ('email_verification', 'password_reset', 'password_changed', 'admin_invitation');

-- ============================================================================
-- AlterTable auth_accounts : ajout password_hash + CHECK constraint
-- ============================================================================

-- AlterTable
ALTER TABLE "auth_accounts" ADD COLUMN     "password_hash" TEXT;

-- Invariant : si provider='credentials', password_hash NOT NULL (feature 002).
ALTER TABLE "auth_accounts"
  ADD CONSTRAINT "credential_password_required"
  CHECK ("provider" != 'credentials' OR "password_hash" IS NOT NULL);

-- ============================================================================
-- Partial unique index sur auth_users.email
-- Remplace l'unique simple par un index partiel WHERE email IS NOT NULL.
-- Postgres autorise plusieurs NULL dans un unique simple — pas ce qu'on veut
-- pour credentials. (cf. C4 / M1 review architecte.)
-- ============================================================================

DROP INDEX IF EXISTS "auth_users_email_key";
CREATE UNIQUE INDEX "auth_users_email_unique_not_null"
  ON "auth_users"("email")
  WHERE "email" IS NOT NULL;

-- ============================================================================
-- CreateTable auth_email_verification_tokens
-- ============================================================================

CREATE TABLE "auth_email_verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jwtNonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "auth_email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- CreateTable auth_password_reset_tokens
-- ============================================================================

CREATE TABLE "auth_password_reset_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jwtNonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),

    CONSTRAINT "auth_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- CreateTable auth_admin_invitation_tokens
-- ============================================================================

CREATE TABLE "auth_admin_invitation_tokens" (
    "id" UUID NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "inviterUserId" UUID NOT NULL,
    "jwtNonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAuthUserId" UUID,

    CONSTRAINT "auth_admin_invitation_tokens_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- CreateTable auth_audit_events (immuable — triggers en migration 2)
-- ============================================================================

CREATE TABLE "auth_audit_events" (
    "id" UUID NOT NULL,
    "eventType" "AuthAuditEventType" NOT NULL,
    "actorUserId" UUID,
    "targetUserId" UUID,
    "actorEmailHash" VARCHAR(64),
    "targetEmailHash" VARCHAR(64),
    "actorIp" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "auth_audit_events_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- CreateTable auth_login_lockout_buckets
-- ============================================================================

CREATE TABLE "auth_login_lockout_buckets" (
    "id" UUID NOT NULL,
    "kind" "LoginLockoutKind" NOT NULL,
    "accountId" UUID,
    "ipHash" BYTEA,
    "failureCount" INTEGER NOT NULL DEFAULT 1,
    "windowStartAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFailureAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_login_lockout_buckets_pkey" PRIMARY KEY ("id")
);

-- Invariant XOR : kind='login_account' ⇒ accountId NOT NULL + ipHash NULL.
--                 kind='login_ip'      ⇒ accountId NULL + ipHash NOT NULL.
ALTER TABLE "auth_login_lockout_buckets"
  ADD CONSTRAINT "login_lockout_key_xor"
  CHECK (
    ("kind" = 'login_account' AND "accountId" IS NOT NULL AND "ipHash" IS NULL)
    OR
    ("kind" = 'login_ip' AND "accountId" IS NULL AND "ipHash" IS NOT NULL)
  );

-- ============================================================================
-- CreateTable auth_outbox_emails
-- ============================================================================

CREATE TABLE "auth_outbox_emails" (
    "id" UUID NOT NULL,
    "recipientUserId" UUID,
    "recipientEmail" TEXT NOT NULL,
    "templateKind" "AuthEmailTemplate" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "auth_outbox_emails_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE UNIQUE INDEX "auth_email_verification_tokens_jwtNonce_key" ON "auth_email_verification_tokens"("jwtNonce");
CREATE INDEX "auth_email_verification_tokens_userId_idx" ON "auth_email_verification_tokens"("userId");
CREATE INDEX "auth_email_verification_tokens_expiresAt_idx" ON "auth_email_verification_tokens"("expiresAt");

CREATE UNIQUE INDEX "auth_password_reset_tokens_jwtNonce_key" ON "auth_password_reset_tokens"("jwtNonce");
CREATE INDEX "auth_password_reset_tokens_userId_consumedAt_invalidatedAt_idx" ON "auth_password_reset_tokens"("userId", "consumedAt", "invalidatedAt");
CREATE INDEX "auth_password_reset_tokens_expiresAt_idx" ON "auth_password_reset_tokens"("expiresAt");

CREATE UNIQUE INDEX "auth_admin_invitation_tokens_jwtNonce_key" ON "auth_admin_invitation_tokens"("jwtNonce");
CREATE INDEX "auth_admin_invitation_tokens_targetEmail_idx" ON "auth_admin_invitation_tokens"("targetEmail");
CREATE INDEX "auth_admin_invitation_tokens_expiresAt_idx" ON "auth_admin_invitation_tokens"("expiresAt");

CREATE INDEX "auth_audit_events_targetUserId_occurredAt_idx" ON "auth_audit_events"("targetUserId", "occurredAt" DESC);
CREATE INDEX "auth_audit_events_targetEmailHash_occurredAt_idx" ON "auth_audit_events"("targetEmailHash", "occurredAt" DESC);
CREATE INDEX "auth_audit_events_eventType_occurredAt_idx" ON "auth_audit_events"("eventType", "occurredAt" DESC);

CREATE INDEX "auth_login_lockout_buckets_windowStartAt_idx" ON "auth_login_lockout_buckets"("windowStartAt" DESC);
CREATE UNIQUE INDEX "login_lockout_key_unique" ON "auth_login_lockout_buckets"("kind", "accountId", "ipHash");

CREATE INDEX "auth_outbox_emails_sentAt_createdAt_idx" ON "auth_outbox_emails"("sentAt", "createdAt");

-- ============================================================================
-- Foreign keys
-- ============================================================================

ALTER TABLE "auth_email_verification_tokens" ADD CONSTRAINT "auth_email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_password_reset_tokens" ADD CONSTRAINT "auth_password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_admin_invitation_tokens" ADD CONSTRAINT "auth_admin_invitation_tokens_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "auth_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auth_outbox_emails" ADD CONSTRAINT "auth_outbox_emails_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "auth_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Note H7 / ADR-0012 :
-- auth_audit_events n'a INTENTIONNELLEMENT aucune FK vers auth_users.
-- Permet l'effacement Loi 25 (DELETE auth_users) sans déclencher d'UPDATE
-- ou DELETE sur auth_audit_events (rejeté par les triggers d'immutability
-- de la migration 20260527000001).
-- ============================================================================
