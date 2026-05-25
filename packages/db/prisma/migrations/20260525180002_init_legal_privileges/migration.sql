-- Migration 004 — Privilèges DB par rôle applicatif sur les tables légales.
--
-- Cf. specs/004-mentions-legales/data-model.md *Privilèges DB par rôle*
-- + Principe V (enforcement frontière modulaire).
--
-- Stratégie défense en profondeur (Principe IX) :
--   * app_identite : SELECT + INSERT sur les 3 tables (seul writer).
--     L'INSERT sur auth_legal_acceptance_anonymizations permet l'effacement
--     Loi 25 via AnonymizeLegalAcceptancesUseCase (orchestré depuis
--     EraseConseillerDataUseCase du module conformité, mais l'écriture
--     elle-même se fait sous app_identite).
--   * app_conformite : SELECT only (utile pour rapports OPC / audit Loi 25).
--   * UPDATE et DELETE REVOQUÉS pour cohérence avec les triggers immutables.
--
-- Note : le rôle app_intake (futur, module 002) recevra SELECT uniquement
-- via une migration de cette feature 002 quand elle sera développée.

-- ---------------------------------------------------------------------
-- 1. Création du rôle app_identite (idempotent — pattern de 0000_setup_db_roles)
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_identite'
  ) THEN
    -- Password injecté ultérieurement via ALTER ROLE en prod (AWS Secrets Manager)
    -- ou récupéré via 1Password CLI en dev.
    CREATE ROLE app_identite WITH LOGIN PASSWORD 'change_me_in_deploy';
  END IF;
END
$$;

-- Privilèges de connexion + usage du schéma public
GRANT CONNECT ON DATABASE current_database() TO app_identite;
GRANT USAGE ON SCHEMA public TO app_identite;

-- ---------------------------------------------------------------------
-- 2. Privilèges app_identite (writer principal)
-- ---------------------------------------------------------------------

GRANT SELECT, INSERT ON auth_legal_documents TO app_identite;
GRANT SELECT, INSERT ON auth_legal_acceptances TO app_identite;
GRANT SELECT, INSERT ON auth_legal_acceptance_anonymizations TO app_identite;

-- Triggers immutables bloquent déjà UPDATE/DELETE, mais on REVOKE
-- explicitement pour défense en profondeur (catch any privilege drift).
REVOKE UPDATE, DELETE, TRUNCATE ON auth_legal_documents FROM app_identite;
REVOKE UPDATE, DELETE, TRUNCATE ON auth_legal_acceptances FROM app_identite;
REVOKE UPDATE, DELETE, TRUNCATE ON auth_legal_acceptance_anonymizations FROM app_identite;

-- Usage des types enums
GRANT USAGE ON TYPE "LegalDocumentType" TO app_identite;
GRANT USAGE ON TYPE "LegalAcceptanceSubjectType" TO app_identite;

-- ---------------------------------------------------------------------
-- 3. Privilèges app_conformite (read-only — audit Loi 25 cross-module)
-- ---------------------------------------------------------------------

DO $$
BEGIN
  -- Si app_conformite n'existe pas (cas où on tournerait cette migration sans
  -- avoir tourné celles de 001), on no-op proprement. La migration 0000_setup_db_roles
  -- crée le rôle ; en pratique on l'attend déjà présent.
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_conformite') THEN
    GRANT SELECT ON auth_legal_documents TO app_conformite;
    GRANT SELECT ON auth_legal_acceptances TO app_conformite;
    GRANT SELECT ON auth_legal_acceptance_anonymizations TO app_conformite;
    GRANT USAGE ON TYPE "LegalDocumentType" TO app_conformite;
    GRANT USAGE ON TYPE "LegalAcceptanceSubjectType" TO app_conformite;
  END IF;
END
$$;
