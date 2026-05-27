-- Migration 004 — Triggers d'immutabilité stricte des 3 tables légales.
--
-- Cf. specs/004-mentions-legales/data-model.md *Migration SQL complémentaire*
-- + ADR-0008 (anonymisation Loi 25 par hash salé immutable).
--
-- Stratégie défense en profondeur (Principe IX) :
--   1. Trigger PL/pgSQL qui lève une exception sur UPDATE/DELETE sur les
--      3 tables. Cohérent avec le pattern conformite_audit_block_modifications
--      livré en 001 mais plus strict (zéro UPDATE permis, même pour
--      l'anonymisation — celle-ci passe par INSERT dans la table dédiée
--      auth_legal_acceptance_anonymizations).
--   2. REVOKE UPDATE, DELETE pour le rôle applicatif app_identite
--      (cf. migration 20260525180002_init_legal_privileges).
--
-- Cohérence avec ADR-0008 : aucune row de auth_legal_acceptances n'est
-- jamais mutée après création. L'anonymisation Loi 25 est INSERT-only
-- dans la table séparée — c'est la garantie testée par les invariants
-- t.test.ts de la phase Foundational.

-- ---------------------------------------------------------------------
-- 1. Trigger immutabilité auth_legal_documents
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth_legal_documents_block_modifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'auth_legal_documents is immutable; TG_OP=% rejected', TG_OP;
END;
$$;

CREATE TRIGGER trg_auth_legal_documents_immutable
  BEFORE UPDATE OR DELETE ON auth_legal_documents
  FOR EACH ROW
  EXECUTE FUNCTION auth_legal_documents_block_modifications();

-- ---------------------------------------------------------------------
-- 2. Trigger immutabilité auth_legal_acceptances
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth_legal_acceptances_block_modifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'auth_legal_acceptances is append-only; TG_OP=% rejected. For anonymization, insert into auth_legal_acceptance_anonymizations instead.', TG_OP;
END;
$$;

CREATE TRIGGER trg_auth_legal_acceptances_immutable
  BEFORE UPDATE OR DELETE ON auth_legal_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION auth_legal_acceptances_block_modifications();

-- ---------------------------------------------------------------------
-- 3. Trigger immutabilité auth_legal_acceptance_anonymizations
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth_legal_acceptance_anonymizations_block_modifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'auth_legal_acceptance_anonymizations is append-only; TG_OP=% rejected', TG_OP;
END;
$$;

CREATE TRIGGER trg_auth_legal_acceptance_anonymizations_immutable
  BEFORE UPDATE OR DELETE ON auth_legal_acceptance_anonymizations
  FOR EACH ROW
  EXECUTE FUNCTION auth_legal_acceptance_anonymizations_block_modifications();

-- ---------------------------------------------------------------------
-- 4. Couverture TRUNCATE (sinon TRUNCATE contourne les triggers row-level)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth_legal_block_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TRUNCATE rejected on legal table % — append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER trg_auth_legal_documents_block_truncate
  BEFORE TRUNCATE ON auth_legal_documents
  FOR EACH STATEMENT
  EXECUTE FUNCTION auth_legal_block_truncate();

CREATE TRIGGER trg_auth_legal_acceptances_block_truncate
  BEFORE TRUNCATE ON auth_legal_acceptances
  FOR EACH STATEMENT
  EXECUTE FUNCTION auth_legal_block_truncate();

CREATE TRIGGER trg_auth_legal_acceptance_anonymizations_block_truncate
  BEFORE TRUNCATE ON auth_legal_acceptance_anonymizations
  FOR EACH STATEMENT
  EXECUTE FUNCTION auth_legal_block_truncate();
