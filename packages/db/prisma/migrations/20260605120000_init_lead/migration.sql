-- T007 — Migration init_lead (feature 012) : 4 tables + 5 enums + indexes + FKs.
-- Cf. specs/012-lead-notifications-state-machine/data-model.md.
--
-- Périmètre STRICT : objets `lead_*` / `consumed_matching_events` uniquement.
-- Aucune table `matching_*` de 011 n'est touchée (le diff Prisma génère du
-- bruit TIMESTAMPTZ↔timestamp + renommage FK sur 011 — volontairement exclu).
--
-- Triggers append-only + cascade anonymisation arrivent dans les migrations
-- suivantes (T008, T009). Colonnes temporelles en TIMESTAMPTZ (cohérent avec
-- les tables sœurs matching_* de 011).

-- =====================================================================
-- 1. Enums Postgres (feature 012)
-- =====================================================================

CREATE TYPE "LeadState" AS ENUM (
  'envoye',
  'vu',
  'accepte',
  'refuse',
  'devis_envoye',
  'reservation_confirmee',
  'perdu'
);

CREATE TYPE "LeadAction" AS ENUM (
  'marquer_vu',
  'accepter',
  'refuser',
  'marquer_devis_envoye',
  'marquer_reservation_confirmee',
  'marquer_perdu',
  'clore_systeme'
);

CREATE TYPE "LeadTransitionActor" AS ENUM ('conseiller', 'systeme');

CREATE TYPE "LeadNotificationChannel" AS ENUM ('email');

CREATE TYPE "LeadNotificationStatus" AS ENUM (
  'pending',
  'sent',
  'failed',
  'skipped_unverified'
);

-- =====================================================================
-- 2. Tables
-- =====================================================================

-- Lead — 1 par (conseiller × matchingResult) ; idempotence FR-003.
CREATE TABLE "leads" (
  "id"                          UUID PRIMARY KEY,
  "matchingResultId"            UUID NOT NULL,
  "matchingResultEntryPosition" SMALLINT NOT NULL,
  "conseillerId"                UUID NOT NULL,
  "briefId"                     UUID,
  "currentState"                "LeadState" NOT NULL DEFAULT 'envoye',
  "scoreFinal"                  DECIMAL(5, 4),
  "boosted"                     BOOLEAN NOT NULL DEFAULT FALSE,
  "closeReason"                 VARCHAR(64),
  "createdAt"                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"                   TIMESTAMPTZ NOT NULL,

  -- Position dans le top 3 (data-model — CHECK 1..3).
  CONSTRAINT chk_lead_entry_position_range CHECK ("matchingResultEntryPosition" IN (1, 2, 3))
);

-- Idempotence FR-003 : 1 lead par (conseiller × matchingResult).
CREATE UNIQUE INDEX "leads_conseillerId_matchingResultId_key"
  ON "leads" ("conseillerId", "matchingResultId");
CREATE INDEX "leads_briefId_idx" ON "leads" ("briefId");
CREATE INDEX "leads_currentState_idx" ON "leads" ("currentState");
CREATE INDEX "leads_conseillerId_createdAt_idx"
  ON "leads" ("conseillerId", "createdAt" DESC);

-- LeadTransition — historique immuable (append-only trigger en T008).
CREATE TABLE "lead_transitions" (
  "id"         UUID PRIMARY KEY,
  "leadId"     UUID NOT NULL,
  "fromState"  "LeadState",
  "toState"    "LeadState" NOT NULL,
  "action"     "LeadAction" NOT NULL,
  "actor"      "LeadTransitionActor" NOT NULL,
  "actorId"    UUID,
  "reason"     VARCHAR(500),
  "occurredAt" TIMESTAMPTZ NOT NULL,

  -- Acteur conseiller ⇒ actorId présent ; systeme ⇒ actorId null.
  CONSTRAINT chk_lead_transition_actor_id CHECK (
    ("actor" = 'conseiller' AND "actorId" IS NOT NULL) OR
    ("actor" = 'systeme' AND "actorId" IS NULL)
  )
);

CREATE INDEX "lead_transitions_leadId_occurredAt_idx"
  ON "lead_transitions" ("leadId", "occurredAt" ASC);

-- LeadNotificationOutbox — 1 notification par destinataire (Principe X).
CREATE TABLE "lead_notification_outbox" (
  "id"             UUID PRIMARY KEY,
  "leadId"         UUID NOT NULL,
  "conseillerId"   UUID NOT NULL,
  "idempotencyKey" VARCHAR(255) NOT NULL,
  "channel"        "LeadNotificationChannel" NOT NULL DEFAULT 'email',
  "status"         "LeadNotificationStatus" NOT NULL DEFAULT 'pending',
  "attempts"       INTEGER NOT NULL DEFAULT 0,
  "lastError"      TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "sentAt"         TIMESTAMPTZ
);

-- Idempotence FR-003 : `lead:{conseillerId}:{matchingResultId}`.
CREATE UNIQUE INDEX "lead_notification_outbox_idempotencyKey_key"
  ON "lead_notification_outbox" ("idempotencyKey");
CREATE INDEX "lead_notification_outbox_status_createdAt_idx"
  ON "lead_notification_outbox" ("status", "createdAt" ASC);

-- ConsumedMatchingEvent — dédup at-least-once des événements bus (ADR-0026).
CREATE TABLE "consumed_matching_events" (
  "idempotencyKey" VARCHAR(255) PRIMARY KEY,
  "eventName"      VARCHAR(64) NOT NULL,
  "consumedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 3. Foreign keys
-- =====================================================================

ALTER TABLE "leads"
  ADD CONSTRAINT "leads_matchingResultId_fkey"
  FOREIGN KEY ("matchingResultId") REFERENCES "matching_results" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_transitions"
  ADD CONSTRAINT "lead_transitions_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_notification_outbox"
  ADD CONSTRAINT "lead_notification_outbox_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
