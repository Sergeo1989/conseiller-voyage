-- T008 — Protection append-only de lead_transitions (feature 012, FR-007).
-- Pattern hérité de 20260531133022_matching_audit_append_only (001/008).
--
-- Stratégie :
--   1. Trigger PL/pgSQL bloquant UPDATE/DELETE row-level
--   2. Trigger PL/pgSQL bloquant TRUNCATE statement-level
--   3. GRANTs least-privilege sur les nouvelles tables lead_* pour app_matching
--      (SELECT/INSERT partout ; UPDATE limité à leads + lead_notification_outbox ;
--       lead_transitions et consumed_matching_events restent INSERT-only).

-- ---------------------------------------------------------------------
-- 1. Trigger append-only lead_transitions — row-level (UPDATE/DELETE)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION lead_transitions_block_modifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'lead_transitions is append-only — TG_OP=% rejected', TG_OP;
END;
$$;

CREATE TRIGGER trg_lead_transitions_block_updates
  BEFORE UPDATE OR DELETE ON lead_transitions
  FOR EACH ROW
  EXECUTE FUNCTION lead_transitions_block_modifications();

-- ---------------------------------------------------------------------
-- 2. Trigger append-only lead_transitions — TRUNCATE (statement-level)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION lead_transitions_block_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'lead_transitions is append-only — TRUNCATE rejected';
END;
$$;

CREATE TRIGGER trg_lead_transitions_block_truncate
  BEFORE TRUNCATE ON lead_transitions
  FOR EACH STATEMENT
  EXECUTE FUNCTION lead_transitions_block_truncate();

-- ---------------------------------------------------------------------
-- 3. GRANTs least-privilege app_matching sur les tables lead_*
-- ---------------------------------------------------------------------
-- Le rôle app_matching existe déjà (créé par 20260531133022). On étend ses
-- privilèges aux nouvelles tables 012.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_matching') THEN
    -- SELECT + INSERT sur toutes les tables lead_*
    GRANT SELECT, INSERT ON
      leads,
      lead_transitions,
      lead_notification_outbox,
      consumed_matching_events
    TO app_matching;

    -- UPDATE sur leads (currentState dénormalisé + briefId cascade Loi 25 +
    -- closeReason) et lead_notification_outbox (status/attempts/sentAt).
    GRANT UPDATE ON
      leads,
      lead_notification_outbox
    TO app_matching;

    -- DELETE strict sur l'outbox notifications (purge rétention applicative).
    GRANT DELETE ON lead_notification_outbox TO app_matching;

    -- Défense en profondeur : pas d'UPDATE/DELETE sur l'historique append-only.
    REVOKE UPDATE, DELETE ON lead_transitions FROM app_matching;
  END IF;
END
$$;
