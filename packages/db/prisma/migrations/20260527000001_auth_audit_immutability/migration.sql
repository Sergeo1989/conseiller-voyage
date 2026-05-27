-- Migration auth_audit_immutability — feature 002.
--
-- Pose les triggers Postgres qui rejettent toute mutation sur auth_audit_events.
-- Pattern hérité de 001 (audit conformite) et 002a (mfa_audit_events).
--
-- Principe IX NON-NÉGOCIABLE (constitution v2.2.0) : journal d'audit immuable
-- au niveau de la base de données — pas seulement au niveau application.
--
-- Voir ADR-0012 (docs/adr/0012-audit-vs-loi-25-no-fk-policy.md) pour la
-- résolution de la contradiction avec Principe II (effacement Loi 25).
--
-- Procédure de rollback exceptionnelle (DROP TRIGGER → opération → recréer) :
-- voir docs/runbooks/auth-rollback.md.

CREATE OR REPLACE FUNCTION reject_auth_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'auth_audit_events est append-only — TG_OP=% rejeté sur la table %', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auth_audit_events_no_update
  BEFORE UPDATE ON auth_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_auth_audit_mutation();

CREATE TRIGGER auth_audit_events_no_delete
  BEFORE DELETE ON auth_audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_auth_audit_mutation();

CREATE TRIGGER auth_audit_events_no_truncate
  BEFORE TRUNCATE ON auth_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_auth_audit_mutation();
