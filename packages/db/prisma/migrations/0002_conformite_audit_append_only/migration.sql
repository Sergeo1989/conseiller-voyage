-- T059 + couplage T058 — Protection append-only de conformite_audit_entries.
--
-- Stratégie défense en profondeur (R2) :
--   1. Trigger PL/pgSQL qui lève une exception sur UPDATE/DELETE.
--      (Garantit l'invariant même si un opérateur se connecte en superuser.)
--   2. REVOKE UPDATE, DELETE pour le rôle applicatif app_conformite.
--      (Empêche un bug d'écriture côté code de tenter une mutation.)
--   3. GRANT SELECT, INSERT au même rôle pour toutes les autres tables
--      du module conformité.
--
-- Cf. specs/001-conformite-module/data-model.md *Migration append-only*
-- et research.md R2.

-- ---------------------------------------------------------------------
-- 1. Trigger append-only
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION conformite_audit_block_modifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit log is append-only — TG_OP=% rejected on conformite_audit_entries', TG_OP;
END;
$$;

CREATE TRIGGER trg_conformite_audit_block_updates
  BEFORE UPDATE OR DELETE ON conformite_audit_entries
  FOR EACH ROW
  EXECUTE FUNCTION conformite_audit_block_modifications();

-- ---------------------------------------------------------------------
-- 2. Privilèges restreints pour app_conformite
-- ---------------------------------------------------------------------

-- Tables conformite_* : SELECT + INSERT (les UPDATE métier passent par
-- des tables muables comme submissions/compliances qui obtiennent UPDATE
-- explicitement ci-dessous).

GRANT SELECT, INSERT ON
  conformite_conseiller_compliances,
  conformite_submissions,
  conformite_certificats,
  conformite_affiliations,
  conformite_permit_revocations,
  conformite_upload_intents,
  conformite_audit_entries,
  conformite_outbox
TO app_conformite;

-- UPDATE accordé sur les tables muables (transitions de statut,
-- décisions admin, consumed intents, publication outbox).
GRANT UPDATE ON
  conformite_conseiller_compliances,
  conformite_submissions,
  conformite_certificats,
  conformite_affiliations,
  conformite_upload_intents,
  conformite_outbox
TO app_conformite;

-- DELETE strict : autorisé uniquement sur upload_intents (cleanup job
-- T115) et outbox (purge des événements publiés > X jours).
GRANT DELETE ON
  conformite_upload_intents,
  conformite_outbox
TO app_conformite;

-- REVOKE explicite sur audit_entries — défense en profondeur même si
-- l'absence de GRANT UPDATE/DELETE ci-dessus suffit en théorie.
REVOKE UPDATE, DELETE ON conformite_audit_entries FROM app_conformite;

-- Sequences (utilisées pour les serial/identity colonnes — Prisma utilise
-- UUID @default(uuid()) côté client donc pas indispensable, mais sécurise
-- toute évolution future).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_conformite;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_conformite;

-- ---------------------------------------------------------------------
-- 3. Privilèges sur les tables auth_* (lecture seule pour app_conformite)
-- ---------------------------------------------------------------------
-- L'API lit auth_sessions / auth_users via PrismaAuthSessionReader pour
-- l'AuthGuard (T018-T019). Aucune écriture côté API — c'est Auth.js
-- (apps/web) qui écrit, sous son propre rôle DB.

GRANT SELECT ON
  auth_users,
  auth_sessions,
  auth_accounts,
  auth_verification_tokens
TO app_conformite;
