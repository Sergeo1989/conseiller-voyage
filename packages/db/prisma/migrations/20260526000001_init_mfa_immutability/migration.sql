-- Migration init_mfa_immutability — feature 005 (Principe IX, R8)
--
-- Protection append-only de mfa_audit_events.
--
-- Pattern : 3 triggers (BEFORE UPDATE/DELETE/TRUNCATE) qui RAISE EXCEPTION.
-- Même pattern que feature 001 sur conformite_audit_entries (migration
-- 0002_conformite_audit_append_only + 20260525170000_audit_block_truncate).
--
-- Note : REVOKE TRUNCATE n'est pas applicable car le privilège TRUNCATE
-- Postgres est lié à l'OWNER de la table, pas à un GRANT séparé.
-- Le trigger BEFORE TRUNCATE est donc la défense ultime.
--
-- Cf. specs/005-mfa-conseiller/research.md R8.

-- ---------------------------------------------------------------------
-- 1. Fonction trigger — refuse toute modification
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mfa_audit_block_modifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit log is append-only — TG_OP=% rejected on mfa_audit_events', TG_OP;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Triggers append-only
-- ---------------------------------------------------------------------

-- UPDATE/DELETE : row-level (BEFORE UPDATE OR DELETE FOR EACH ROW)
CREATE TRIGGER trg_mfa_audit_block_updates
  BEFORE UPDATE OR DELETE ON mfa_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION mfa_audit_block_modifications();

-- TRUNCATE : statement-level (BEFORE TRUNCATE FOR EACH STATEMENT)
-- Le trigger row-level ci-dessus ne se déclenche PAS sur TRUNCATE qui
-- est une commande DDL statement-level en Postgres. Sans ce second
-- trigger, un attaquant qui obtient les credentials du rôle applicatif
-- pourrait TRUNCATE la table en une seule commande et effacer toute
-- l'historique d'audit (jusqu'à 7 ans de données réglementaires liées
-- à Principe IX et obligations audit sécurité).
CREATE TRIGGER trg_mfa_audit_block_truncate
  BEFORE TRUNCATE ON mfa_audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION mfa_audit_block_modifications();

-- ---------------------------------------------------------------------
-- 3. Privilèges restreints pour les rôles applicatifs existants
-- ---------------------------------------------------------------------

-- Les rôles app_conformite (001) et tout futur app_identite n'ont
-- besoin que de SELECT + INSERT sur mfa_audit_events. UPDATE/DELETE
-- sont déjà bloqués par les triggers, mais on REVOKE explicitement
-- pour défense en profondeur (le superutilisateur seul peut contourner,
-- et un audit Postgres détecte tout DROP TRIGGER).
--
-- Pattern DO + format() pour compat shadow DB Prisma (P1-7 du review).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_conformite') THEN
    EXECUTE format('GRANT SELECT, INSERT ON %I TO %I', 'mfa_audit_events', 'app_conformite');
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM %I', 'mfa_audit_events', 'app_conformite');
  END IF;
END $$;

-- Les autres tables mfa_* sont muables (insertions + updates ciblés).
-- Privilèges accordés au rôle app_conformite en attendant la création
-- d'un rôle dédié app_identite (sera créé par la feature 002 quand
-- elle landera). Pour 005 on réutilise le rôle existant qui est déjà
-- celui qui se connecte aux tables auth_*.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_conformite') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO %I', 'mfa_secrets', 'app_conformite');
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO %I', 'mfa_backup_codes', 'app_conformite');
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO %I', 'mfa_rate_limit_buckets', 'app_conformite');
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO %I', 'mfa_outbox_emails', 'app_conformite');
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', 'app_conformite');
  END IF;
END $$;
