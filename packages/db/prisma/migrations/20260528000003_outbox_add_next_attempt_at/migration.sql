-- Migration outbox_add_next_attempt_at — feature 003.
--
-- Expand-compatible : ajoute `next_attempt_at TIMESTAMPTZ NULL` aux
-- tables `auth_outbox_emails` (feature 002) et `mfa_outbox_emails`
-- (feature 002a) pour homogénéiser le backoff exponentiel avec
-- `conformite_outbox` (qui possède déjà cette colonne).
--
-- Ne casse PAS le code 002 / 002a existant : la colonne est nullable
-- et ignorée par les use cases actuels. Le worker 003
-- (AuthOutboxDispatchWorker / MfaOutboxDispatchWorker) la consommera
-- en lecture quand il scanne les entries pending.
--
-- Index partiels (uniquement sur les rows `sentAt IS NULL`) pour
-- optimiser le scan worker sans gonfler les rows déjà envoyées.

-- ============================================================================
-- auth_outbox_emails (feature 002)
-- ============================================================================

ALTER TABLE "auth_outbox_emails"
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ;

CREATE INDEX "auth_outbox_emails_sentAt_nextAttemptAt_idx"
  ON "auth_outbox_emails" ("sentAt", "nextAttemptAt")
  WHERE "sentAt" IS NULL;

COMMENT ON COLUMN "auth_outbox_emails"."nextAttemptAt"
  IS 'Backoff exponentiel (feature 003). NULL = scan immédiat ; non-NULL = scan après ce timestamp.';

-- ============================================================================
-- mfa_outbox_emails (feature 002a)
-- ============================================================================

ALTER TABLE "mfa_outbox_emails"
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ;

CREATE INDEX "mfa_outbox_emails_sentAt_nextAttemptAt_idx"
  ON "mfa_outbox_emails" ("sentAt", "nextAttemptAt")
  WHERE "sentAt" IS NULL;

COMMENT ON COLUMN "mfa_outbox_emails"."nextAttemptAt"
  IS 'Backoff exponentiel (feature 003). NULL = scan immédiat ; non-NULL = scan après ce timestamp.';
