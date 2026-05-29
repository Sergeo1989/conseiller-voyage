-- T014 — Protection append-only de intake_audit_entries.
-- Cf. specs/002-voyageur-intake/data-model.md *Entity: IntakeAuditEntry*
-- Pattern hérité de 0002_conformite_audit_append_only (R2 / ADR-0017 — table
-- séparée, défense en profondeur identique).
--
-- Stratégie :
--   1. Trigger PL/pgSQL bloquant UPDATE/DELETE row-level
--   2. Trigger PL/pgSQL bloquant TRUNCATE statement-level (leçon 001)
--   3. GRANT SELECT, INSERT au rôle app_intake (least privilege)
--   4. REVOKE UPDATE, DELETE sur intake_audit_entries (défense en profondeur)
--   5. GRANT SELECT lecture seule sur les tables transverses utiles
--      (auth_users pour FK soft actorId, conformite_conseiller_compliances
--      pour US5 lookup admin push manuel).

-- ---------------------------------------------------------------------
-- 1. Trigger append-only — row-level (UPDATE/DELETE)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION intake_audit_block_modifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit log is append-only — TG_OP=% rejected on intake_audit_entries', TG_OP;
END;
$$;

CREATE TRIGGER trg_intake_audit_block_updates
  BEFORE UPDATE OR DELETE ON intake_audit_entries
  FOR EACH ROW
  EXECUTE FUNCTION intake_audit_block_modifications();

-- ---------------------------------------------------------------------
-- 2. Trigger append-only — statement-level (TRUNCATE)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION intake_audit_block_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit log is append-only — TRUNCATE rejected on intake_audit_entries';
END;
$$;

CREATE TRIGGER trg_intake_audit_block_truncate
  BEFORE TRUNCATE ON intake_audit_entries
  FOR EACH STATEMENT
  EXECUTE FUNCTION intake_audit_block_truncate();

-- ---------------------------------------------------------------------
-- 3. Rôle applicatif app_intake (least privilege)
-- ---------------------------------------------------------------------
-- Création conditionnelle pour rester idempotent (le rôle peut exister
-- déjà si la migration est rejouée sur une instance partagée).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_intake') THEN
    CREATE ROLE app_intake;
  END IF;
END
$$;

-- SELECT + INSERT sur toutes les tables intake_*
GRANT SELECT, INSERT ON
  intake_voyageur_contacts,
  intake_voyageur_briefs,
  intake_magic_link_tokens,
  intake_audit_entries,
  intake_outbox
TO app_intake;

-- UPDATE accordé sur les tables muables (transitions de statut, mark
-- consumed, publication outbox, anonymisation Loi 25).
GRANT UPDATE ON
  intake_voyageur_contacts,
  intake_voyageur_briefs,
  intake_magic_link_tokens,
  intake_outbox
TO app_intake;

-- DELETE strict : cleanup magic_link_tokens expirés + purge outbox >X jours.
GRANT DELETE ON
  intake_magic_link_tokens,
  intake_outbox
TO app_intake;

-- REVOKE explicite sur intake_audit_entries — défense en profondeur même si
-- l'absence de GRANT UPDATE/DELETE ci-dessus suffit en théorie.
REVOKE UPDATE, DELETE ON intake_audit_entries FROM app_intake;

-- Sequences (Prisma utilise UUID @default(uuid()) côté client donc pas
-- indispensable, mais sécurise toute évolution future qui ajouterait un
-- compteur).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_intake;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_intake;

-- ---------------------------------------------------------------------
-- 4. Lectures cross-module (Principe V — passage par facade publique)
-- ---------------------------------------------------------------------
-- L'API intake lit auth_users (soft FK actorId dans audit) et
-- conformite_conseiller_compliances (US5 admin push manuel — lookup
-- conseiller vérifié via ConformiteQueryFacade).
-- Aucune écriture cross-module n'est accordée.

GRANT SELECT ON
  auth_users,
  auth_sessions,
  conformite_conseiller_compliances
TO app_intake;
