-- Migration notification_audit_block_modifications — feature 003.
--
-- Pose les 2 triggers append-only sur `notification_audit_entries` :
--   1. trg_notification_audit_block_updates : BEFORE UPDATE OR DELETE
--      (row-level). Rejette toute modification/suppression.
--   2. trg_notification_audit_block_truncate : BEFORE TRUNCATE
--      (statement-level). Rejette TRUNCATE qui contournerait le
--      trigger row-level (leçon de la feature 001 — migration
--      20260525170000_audit_block_truncate).
--
-- Defense en profondeur Loi 25 / audit OPC : ces 2 triggers complètent
-- les permissions Postgres et garantissent l'immutabilité du journal
-- d'audit pendant 7 ans (rétention constitutionnelle).
--
-- ADR-0012 (audit no-FK Loi 25) s'applique implicitement — aucune FK
-- vers les autres tables pour permettre l'anonymisation sans
-- corruption référentielle.

CREATE OR REPLACE FUNCTION notification_audit_block_modifications()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'notification_audit_entries is append-only — modifications forbidden (feature 003)';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION notification_audit_block_modifications()
  IS 'Defense en profondeur Loi 25 / audit : empêche toute mutation du journal append-only notifications.';

-- Trigger row-level : UPDATE et DELETE
CREATE TRIGGER trg_notification_audit_block_updates
  BEFORE UPDATE OR DELETE ON "notification_audit_entries"
  FOR EACH ROW
  EXECUTE FUNCTION notification_audit_block_modifications();

COMMENT ON TRIGGER trg_notification_audit_block_updates ON "notification_audit_entries"
  IS 'Defense en profondeur Loi 25 / audit : empêche UPDATE/DELETE row-level.';

-- Trigger statement-level : TRUNCATE
CREATE TRIGGER trg_notification_audit_block_truncate
  BEFORE TRUNCATE ON "notification_audit_entries"
  FOR EACH STATEMENT
  EXECUTE FUNCTION notification_audit_block_modifications();

COMMENT ON TRIGGER trg_notification_audit_block_truncate ON "notification_audit_entries"
  IS 'Defense en profondeur Loi 25 / audit : empêche TRUNCATE statement-level. Cf. ADR-0012.';
