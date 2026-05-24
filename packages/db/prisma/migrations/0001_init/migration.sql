-- T057 — Migration initiale : crée toutes les tables auth_* (T017) et
-- conformite_* (T056) de l'application en une seule étape.
--
-- Généré automatiquement par `prisma migrate diff --from-empty
-- --to-schema-datamodel ./prisma/schema --script` à partir de
-- packages/db/prisma/schema/{base,auth,conformite}.prisma.
--
-- NE PAS éditer à la main : régénérer via la commande ci-dessus si le
-- schéma évolue. Modifications additionnelles à la convention
-- append-only / privilèges → nouvelle migration (cf. 0002).

-- CreateEnum
CREATE TYPE "AuthRole" AS ENUM ('voyageur', 'conseiller', 'admin');

-- CreateEnum
CREATE TYPE "Province" AS ENUM ('QC', 'ON');

-- CreateEnum
CREATE TYPE "ConformiteStatus" AS ENUM ('pending', 'verified', 'suspended', 'revoked');

-- CreateEnum
CREATE TYPE "SubmissionDecision" AS ENUM ('pending', 'approved', 'refused');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('pending', 'approved', 'refused');

-- CreateEnum
CREATE TYPE "AffiliationInactivationReason" AS ENUM ('conseiller', 'permit_revocation', 'admin');

-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('conseiller', 'admin', 'system');

-- CreateTable
CREATE TABLE "auth_users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "role" "AuthRole" NOT NULL DEFAULT 'conseiller',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "mfaVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "conformite_conseiller_compliances" (
    "id" UUID NOT NULL,
    "conseillerId" UUID NOT NULL,
    "status" "ConformiteStatus" NOT NULL DEFAULT 'pending',
    "lastVerifiedAt" TIMESTAMP(3),
    "lastStatusChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentToProcessGivenAt" TIMESTAMP(3),
    "erasureRequestedAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),

    CONSTRAINT "conformite_conseiller_compliances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conformite_submissions" (
    "id" UUID NOT NULL,
    "conseillerComplianceId" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "decidedByAdminId" UUID,
    "decisionReason" TEXT,

    CONSTRAINT "conformite_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conformite_certificats" (
    "id" UUID NOT NULL,
    "conseillerComplianceId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "province" "Province" NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "documentObjectKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" "SubmissionDecision" NOT NULL DEFAULT 'pending',
    "decisionAt" TIMESTAMP(3),
    "decisionByAdminId" UUID,
    "refusalReason" TEXT,
    "supersededById" UUID,

    CONSTRAINT "conformite_certificats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conformite_affiliations" (
    "id" UUID NOT NULL,
    "conseillerComplianceId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "agencyName" VARCHAR(200) NOT NULL,
    "agencyPermitNumber" TEXT NOT NULL,
    "agencyProvince" "Province" NOT NULL,
    "proofObjectKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decision" "SubmissionDecision" NOT NULL DEFAULT 'pending',
    "decisionAt" TIMESTAMP(3),
    "decisionByAdminId" UUID,
    "refusalReason" TEXT,
    "role" TEXT,
    "activeSince" TIMESTAMP(3),
    "activeUntil" TIMESTAMP(3),
    "inactivatedBy" "AffiliationInactivationReason",
    "inactivatedAt" TIMESTAMP(3),

    CONSTRAINT "conformite_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conformite_permit_revocations" (
    "id" UUID NOT NULL,
    "agencyPermitNumber" TEXT NOT NULL,
    "agencyProvince" "Province" NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "declaredByAdminId" UUID NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "conformite_permit_revocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conformite_upload_intents" (
    "id" UUID NOT NULL,
    "conseillerComplianceId" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "expectedContentType" TEXT NOT NULL,
    "expectedContentLength" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "conformite_upload_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conformite_audit_entries" (
    "id" UUID NOT NULL,
    "conseillerComplianceId" UUID,
    "eventType" TEXT NOT NULL,
    "actorId" UUID,
    "actorRole" "ActorRole" NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,
    "correlationId" TEXT,

    CONSTRAINT "conformite_audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conformite_outbox" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "conformite_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");

-- CreateIndex
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_providerAccountId_key" ON "auth_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_sessionToken_key" ON "auth_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_idx" ON "auth_sessions"("expires");

-- CreateIndex
CREATE UNIQUE INDEX "auth_verification_tokens_token_key" ON "auth_verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "auth_verification_tokens_identifier_token_key" ON "auth_verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "conformite_conseiller_compliances_conseillerId_key" ON "conformite_conseiller_compliances"("conseillerId");

-- CreateIndex
CREATE INDEX "conformite_conseiller_compliances_status_idx" ON "conformite_conseiller_compliances"("status");

-- CreateIndex
CREATE INDEX "conformite_conseiller_compliances_lastStatusChangeAt_idx" ON "conformite_conseiller_compliances"("lastStatusChangeAt");

-- CreateIndex
CREATE INDEX "conformite_submissions_conseillerComplianceId_submittedAt_idx" ON "conformite_submissions"("conseillerComplianceId", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "conformite_submissions_status_submittedAt_idx" ON "conformite_submissions"("status", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "conformite_certificats_conseillerComplianceId_province_idx" ON "conformite_certificats"("conseillerComplianceId", "province");

-- CreateIndex
CREATE INDEX "conformite_certificats_expiresAt_idx" ON "conformite_certificats"("expiresAt");

-- CreateIndex
CREATE INDEX "conformite_certificats_submissionId_idx" ON "conformite_certificats"("submissionId");

-- CreateIndex
CREATE INDEX "conformite_affiliations_agencyPermitNumber_agencyProvince_idx" ON "conformite_affiliations"("agencyPermitNumber", "agencyProvince");

-- CreateIndex
CREATE INDEX "conformite_affiliations_conseillerComplianceId_idx" ON "conformite_affiliations"("conseillerComplianceId");

-- CreateIndex
CREATE INDEX "conformite_affiliations_submissionId_idx" ON "conformite_affiliations"("submissionId");

-- CreateIndex
CREATE INDEX "conformite_permit_revocations_revokedAt_idx" ON "conformite_permit_revocations"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "conformite_permit_revocations_agencyPermitNumber_agencyProv_key" ON "conformite_permit_revocations"("agencyPermitNumber", "agencyProvince");

-- CreateIndex
CREATE INDEX "conformite_upload_intents_conseillerComplianceId_createdAt_idx" ON "conformite_upload_intents"("conseillerComplianceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "conformite_upload_intents_expiresAt_idx" ON "conformite_upload_intents"("expiresAt");

-- CreateIndex
CREATE INDEX "conformite_audit_entries_conseillerComplianceId_occurredAt_idx" ON "conformite_audit_entries"("conseillerComplianceId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "conformite_audit_entries_eventType_occurredAt_idx" ON "conformite_audit_entries"("eventType", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "audit_idempotency_key" ON "conformite_audit_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "conformite_outbox_publishedAt_nextAttemptAt_idx" ON "conformite_outbox"("publishedAt", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conformite_submissions" ADD CONSTRAINT "conformite_submissions_conseillerComplianceId_fkey" FOREIGN KEY ("conseillerComplianceId") REFERENCES "conformite_conseiller_compliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conformite_certificats" ADD CONSTRAINT "conformite_certificats_conseillerComplianceId_fkey" FOREIGN KEY ("conseillerComplianceId") REFERENCES "conformite_conseiller_compliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conformite_certificats" ADD CONSTRAINT "conformite_certificats_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "conformite_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conformite_certificats" ADD CONSTRAINT "conformite_certificats_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "conformite_certificats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conformite_affiliations" ADD CONSTRAINT "conformite_affiliations_conseillerComplianceId_fkey" FOREIGN KEY ("conseillerComplianceId") REFERENCES "conformite_conseiller_compliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conformite_affiliations" ADD CONSTRAINT "conformite_affiliations_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "conformite_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conformite_upload_intents" ADD CONSTRAINT "conformite_upload_intents_conseillerComplianceId_fkey" FOREIGN KEY ("conseillerComplianceId") REFERENCES "conformite_conseiller_compliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conformite_audit_entries" ADD CONSTRAINT "conformite_audit_entries_conseillerComplianceId_fkey" FOREIGN KEY ("conseillerComplianceId") REFERENCES "conformite_conseiller_compliances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

