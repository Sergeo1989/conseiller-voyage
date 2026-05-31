-- T012 — Migration init_matching : 4 tables + 3 enums + indexes + CHECKs.
-- Cf. specs/008-matching-scoring/data-model.md (4 entités + 3 enums).
--
-- Cette migration crée la structure schema sans triggers ni grants ; ceux-ci
-- arrivent dans les migrations suivantes :
--   - 20260531133022_matching_audit_append_only (T013 — trigger + grants)
--   - 20260531133023_matching_anonymisation_cascade (T014 — Loi 25 cascade)

-- =====================================================================
-- 1. Enums Postgres
-- =====================================================================

CREATE TYPE "MatchingStatus" AS ENUM ('ok', 'partial', 'empty');

CREATE TYPE "MatchingAuditEventType" AS ENUM (
  'matching_computed',
  'matching_empty',
  'matching_partial',
  'matching_replay_ignored',
  'matching_recomputed',
  'matching_all_matches_revoked_detected',
  'matching_conseiller_address_missing'
);

CREATE TYPE "MatchingOutboxEventType" AS ENUM (
  'voyageur_brief_matched',
  'voyageur_brief_partially_matched',
  'voyageur_brief_unmatched',
  'voyageur_brief_all_matches_revoked'
);

-- =====================================================================
-- 2. Tables
-- =====================================================================

-- MatchingResult — un par briefId actif (idempotence FR-004 via UNIQUE INDEX
-- partiel ci-dessous).
CREATE TABLE "matching_results" (
  "id"                            UUID PRIMARY KEY,
  "briefId"                       UUID,
  "status"                        "MatchingStatus" NOT NULL,
  "matchedCount"                  SMALLINT NOT NULL,
  "algorithmVersion"              VARCHAR(16) NOT NULL,
  "suggestedConseillerId"         UUID,
  "boostApplied"                  BOOLEAN NOT NULL DEFAULT FALSE,
  "computedAt"                    TIMESTAMPTZ NOT NULL,
  "supersededAt"                  TIMESTAMPTZ,
  "supersededByMatchingResultId"  UUID,
  "createdAt"                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Plafond 3 strict (SC-003 invariant testé)
  CONSTRAINT chk_matched_count_range CHECK ("matchedCount" BETWEEN 0 AND 3),
  -- Cohérence status ⇔ matchedCount (data-model.md)
  CONSTRAINT chk_status_matches_count CHECK (
    ("matchedCount" = 0 AND "status" = 'empty') OR
    ("matchedCount" BETWEEN 1 AND 2 AND "status" = 'partial') OR
    ("matchedCount" = 3 AND "status" = 'ok')
  ),
  -- Les deux nullables ensemble (superseded chain)
  CONSTRAINT chk_superseded_pair_consistency CHECK (
    ("supersededAt" IS NULL AND "supersededByMatchingResultId" IS NULL) OR
    ("supersededAt" IS NOT NULL AND "supersededByMatchingResultId" IS NOT NULL)
  )
);

-- Idempotence FR-004 : 1 seul MR actif par briefId.
-- WHERE clause exige un index partiel (non supporté par Prisma @@unique).
CREATE UNIQUE INDEX "idx_matching_results_brief_active"
  ON "matching_results" ("briefId")
  WHERE "supersededAt" IS NULL AND "briefId" IS NOT NULL;

-- File admin US5 extension de 008 (alertes WARN partial/empty)
CREATE INDEX "matching_results_status_computedAt_idx"
  ON "matching_results" ("status", "computedAt" DESC);

-- Lookup admin reverse par briefId pour superseded chain
CREATE INDEX "matching_results_briefId_createdAt_idx"
  ON "matching_results" ("briefId", "createdAt" DESC);

-- MatchingResultEntry — 0 à 3 entries par MR.
CREATE TABLE "matching_result_entries" (
  "id"                  UUID PRIMARY KEY,
  "matchingResultId"    UUID NOT NULL,
  "position"            SMALLINT NOT NULL,
  "conseillerId"        UUID NOT NULL,
  "scoreBrut"           DECIMAL(5, 4) NOT NULL,
  "scoreFinal"          DECIMAL(5, 4) NOT NULL,
  "scoreComponents"     JSONB NOT NULL,
  "boosted"             BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_position_range CHECK ("position" IN (1, 2, 3)),
  CONSTRAINT chk_score_brut_range CHECK ("scoreBrut" BETWEEN 0.0000 AND 1.0000),
  CONSTRAINT chk_score_final_range CHECK ("scoreFinal" BETWEEN 0.0000 AND 1.1000),
  -- Boost ne peut que monter, capped à +10% (FR-011 / FR-012)
  CONSTRAINT chk_score_final_geq_brut CHECK ("scoreFinal" >= "scoreBrut"),
  CONSTRAINT chk_score_final_capped CHECK ("scoreFinal" <= "scoreBrut" * 1.1000),
  -- boosted=true ⇒ scoreFinal > scoreBrut
  CONSTRAINT chk_boosted_implies_score_increase CHECK (
    NOT "boosted" OR "scoreFinal" > "scoreBrut"
  ),

  CONSTRAINT fk_matching_result_entries_result
    FOREIGN KEY ("matchingResultId") REFERENCES "matching_results" ("id") ON DELETE CASCADE
);

-- Pas de doublon position 1/2/3 par MR
CREATE UNIQUE INDEX "matching_result_entries_matchingResultId_position_key"
  ON "matching_result_entries" ("matchingResultId", "position");

-- Reverse lookup "mes affectations" pour 012 dashboard conseiller
CREATE INDEX "matching_result_entries_conseillerId_createdAt_idx"
  ON "matching_result_entries" ("conseillerId", "createdAt" DESC);

-- MatchingAuditEntry — append-only (trigger en T013).
CREATE TABLE "matching_audit_entries" (
  "id"                  UUID PRIMARY KEY,
  "briefId"             UUID,
  "matchingResultId"    UUID,
  "eventType"           "MatchingAuditEventType" NOT NULL,
  "payload"             JSONB NOT NULL,
  "idempotencyKey"      VARCHAR(255),
  "correlationId"       VARCHAR(64),
  "occurredAt"          TIMESTAMPTZ NOT NULL
);

CREATE INDEX "matching_audit_entries_briefId_occurredAt_idx"
  ON "matching_audit_entries" ("briefId", "occurredAt" DESC);

CREATE INDEX "matching_audit_entries_eventType_occurredAt_idx"
  ON "matching_audit_entries" ("eventType", "occurredAt" DESC);

-- MatchingOutboxEntry — outbox dédié (R7).
CREATE TABLE "matching_outbox_entries" (
  "id"                  UUID PRIMARY KEY,
  "eventType"           "MatchingOutboxEventType" NOT NULL,
  "payload"             JSONB NOT NULL,
  "idempotencyKey"      VARCHAR(255) NOT NULL,
  "publishedAt"         TIMESTAMPTZ,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX "matching_outbox_entries_idempotencyKey_key"
  ON "matching_outbox_entries" ("idempotencyKey");

CREATE INDEX "matching_outbox_entries_createdAt_pending_idx"
  ON "matching_outbox_entries" ("createdAt" ASC)
  WHERE "publishedAt" IS NULL;
