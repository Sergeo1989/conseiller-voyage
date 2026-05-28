-- T013 — Migration init_intake : tables + indexes + FK du module intake.
-- Cf. specs/002-voyageur-intake/data-model.md (5 entités + 6 enums).
--
-- Cette migration crée la structure schema sans triggers ni grants ; ceux-ci
-- arrivent dans les migrations suivantes :
--   - 20260528170002_intake_audit_append_only (T014 — trigger + grants)
--   - 20260528170003_intake_anonymisation_trigger (T015 — Loi 25 idempotence)
--
-- SQL généré via `prisma migrate diff --from-empty --to-schema-datamodel` puis
-- filtré aux objets intake_*. Cohérent avec les patterns 001/007 (UUID @db.Uuid,
-- snake_case via @@map, indexes composites).

-- =====================================================================
-- 1. Enums Postgres (T011)
-- =====================================================================

CREATE TYPE "BriefStatus" AS ENUM ('pending_verification', 'active', 'matched', 'expired_unverified', 'expired', 'deleted', 'anonymized');

CREATE TYPE "TravelBudget" AS ENUM ('under_2k', 'between_2k_5k', 'between_5k_10k', 'between_10k_20k', 'above_20k');

CREATE TYPE "TravelSpeciality" AS ENUM ('croisiere', 'aventure_outdoor', 'lune_de_miel', 'famille_avec_enfants', 'mobilite_reduite', 'multigenerationnel', 'culturel_historique', 'luxe', 'road_trip', 'voyage_affaires', 'autre');

CREATE TYPE "TravelFamiliarity" AS ENUM ('first_big_trip', 'occasional_traveler', 'experienced_traveler');

CREATE TYPE "ConseillerLanguage" AS ENUM ('fr', 'en', 'es', 'other');

CREATE TYPE "MagicLinkPurpose" AS ENUM ('verify_email', 'view_brief_status');

-- =====================================================================
-- 2. Tables (T012)
-- =====================================================================

CREATE TABLE "intake_voyageur_contacts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "emailHashAfterErasure" CHAR(64),
    "firstName" VARCHAR(100),
    "lastName" VARCHAR(100),
    "phone" VARCHAR(20),
    "postalCode" VARCHAR(7),
    "briefsCount24h" INTEGER NOT NULL DEFAULT 0,
    "briefsCount24hWindowStart" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "anonymizedAt" TIMESTAMP(3),

    CONSTRAINT "intake_voyageur_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "intake_voyageur_briefs" (
    "id" UUID NOT NULL,
    "voyageurContactId" UUID NOT NULL,
    "status" "BriefStatus" NOT NULL DEFAULT 'pending_verification',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consentGivenAt" TIMESTAMP(3) NOT NULL,
    "erasureRequestedAt" TIMESTAMP(3),
    "anonymizedAt" TIMESTAMP(3),
    "abuseMarkedAt" TIMESTAMP(3),
    "destinations" JSONB NOT NULL,
    "departureDate" DATE NOT NULL,
    "returnDate" DATE NOT NULL,
    "datesFlexible" BOOLEAN NOT NULL DEFAULT false,
    "datesFlexibilityDays" INTEGER,
    "adultsCount" INTEGER NOT NULL,
    "childrenAges" JSONB NOT NULL DEFAULT '[]',
    "infantsCount" INTEGER NOT NULL DEFAULT 0,
    "budgetRange" "TravelBudget" NOT NULL,
    "budgetNote" VARCHAR(500),
    "conseillerLanguage" "ConseillerLanguage" NOT NULL,
    "conseillerLanguageOther" CHAR(2),
    "speciality" "TravelSpeciality" NOT NULL,
    "specialityOther" VARCHAR(200),
    "familiarity" "TravelFamiliarity" NOT NULL,
    "clientIp" VARCHAR(45),
    "userAgent" VARCHAR(500),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_voyageur_briefs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "intake_magic_link_tokens" (
    "id" UUID NOT NULL,
    "briefId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "MagicLinkPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_magic_link_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "intake_audit_entries" (
    "id" UUID NOT NULL,
    "voyageurBriefId" UUID,
    "voyageurContactId" UUID,
    "eventType" VARCHAR(100) NOT NULL,
    "actorRole" "ActorRole" NOT NULL,
    "actorId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT,
    "correlationId" UUID,

    CONSTRAINT "intake_audit_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "intake_outbox" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" VARCHAR(1000),

    CONSTRAINT "intake_outbox_pkey" PRIMARY KEY ("id")
);

-- =====================================================================
-- 3. Indexes
-- =====================================================================

CREATE UNIQUE INDEX "intake_voyageur_contacts_email_key" ON "intake_voyageur_contacts"("email");

CREATE INDEX "intake_voyageur_briefs_voyageurContactId_idx" ON "intake_voyageur_briefs"("voyageurContactId");

CREATE INDEX "intake_voyageur_briefs_status_expiresAt_idx" ON "intake_voyageur_briefs"("status", "expiresAt");

CREATE INDEX "intake_voyageur_briefs_verifiedAt_status_idx" ON "intake_voyageur_briefs"("verifiedAt", "status");

CREATE UNIQUE INDEX "intake_voyageur_briefs_idempotency_key_unique" ON "intake_voyageur_briefs"("idempotencyKey");

CREATE UNIQUE INDEX "intake_magic_link_tokens_tokenHash_key" ON "intake_magic_link_tokens"("tokenHash");

CREATE INDEX "intake_magic_link_tokens_briefId_purpose_consumedAt_idx" ON "intake_magic_link_tokens"("briefId", "purpose", "consumedAt");

CREATE INDEX "intake_magic_link_tokens_expiresAt_idx" ON "intake_magic_link_tokens"("expiresAt");

CREATE UNIQUE INDEX "intake_audit_entries_idempotencyKey_key" ON "intake_audit_entries"("idempotencyKey");

CREATE INDEX "intake_audit_entries_voyageurBriefId_occurredAt_idx" ON "intake_audit_entries"("voyageurBriefId", "occurredAt" DESC);

CREATE INDEX "intake_audit_entries_eventType_occurredAt_idx" ON "intake_audit_entries"("eventType", "occurredAt" DESC);

CREATE INDEX "intake_outbox_publishedAt_nextAttemptAt_idx" ON "intake_outbox"("publishedAt", "nextAttemptAt");

-- =====================================================================
-- 4. Foreign keys
-- =====================================================================

ALTER TABLE "intake_voyageur_briefs"
  ADD CONSTRAINT "intake_voyageur_briefs_voyageurContactId_fkey"
  FOREIGN KEY ("voyageurContactId") REFERENCES "intake_voyageur_contacts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "intake_magic_link_tokens"
  ADD CONSTRAINT "intake_magic_link_tokens_briefId_fkey"
  FOREIGN KEY ("briefId") REFERENCES "intake_voyageur_briefs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
