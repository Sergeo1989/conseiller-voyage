-- T013 — Protection append-only de matching_audit_entries.
-- Cf. specs/008-matching-scoring/data-model.md *MatchingAuditEntry*
-- Pattern hérité de 0002_conformite_audit_append_only + 002_intake_audit
-- (ADR-0017 + ADR-0024 — table dédiée par module, défense en profondeur).
--
-- Stratégie :
--   1. Trigger PL/pgSQL bloquant UPDATE/DELETE row-level
--   2. Trigger PL/pgSQL bloquant TRUNCATE statement-level
--   3. Rôle DB `app_matching` least privilege
--   4. Trigger conditionnel sur matching_outbox_entries autorisant UNIQUEMENT
--      l'UPDATE de publishedAt NULL → NOT NULL (pour worker publisher 003)
--   5. GRANTs lecture cross-module (Principe V via facades) : auth_users,
--      profile_conseiller_profiles, conformite_conseiller_compliances,
--      intake_voyageur_briefs (pour brief snapshot reader T058).

-- ---------------------------------------------------------------------
-- 1. Trigger append-only matching_audit_entries — row-level
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION matching_audit_block_modifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit log is append-only — TG_OP=% rejected on matching_audit_entries', TG_OP;
END;
$$;

CREATE TRIGGER trg_matching_audit_block_updates
  BEFORE UPDATE OR DELETE ON matching_audit_entries
  FOR EACH ROW
  EXECUTE FUNCTION matching_audit_block_modifications();

-- ---------------------------------------------------------------------
-- 2. Trigger append-only matching_audit_entries — TRUNCATE (statement-level)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION matching_audit_block_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit log is append-only — TRUNCATE rejected on matching_audit_entries';
END;
$$;

CREATE TRIGGER trg_matching_audit_block_truncate
  BEFORE TRUNCATE ON matching_audit_entries
  FOR EACH STATEMENT
  EXECUTE FUNCTION matching_audit_block_truncate();

-- ---------------------------------------------------------------------
-- 3. matching_outbox_entries — UPDATE conditionnel (publishedAt only)
-- ---------------------------------------------------------------------
-- Le worker publisher (003 extension T093) doit pouvoir marquer
-- publishedAt = now() une fois l'event publié vers le bus. Aucun autre
-- UPDATE n'est autorisé.

CREATE OR REPLACE FUNCTION matching_outbox_block_non_publish_updates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Seul l'UPDATE de publishedAt NULL → NOT NULL est autorisé.
  IF OLD."publishedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'matching_outbox_entries.publishedAt already set — no further updates allowed';
  END IF;
  IF NEW."publishedAt" IS NULL THEN
    RAISE EXCEPTION 'matching_outbox_entries: only publishedAt NULL → NOT NULL transition is allowed';
  END IF;
  -- Tous les autres champs doivent être inchangés.
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."eventType" IS DISTINCT FROM OLD."eventType"
     OR NEW."payload" IS DISTINCT FROM OLD."payload"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'matching_outbox_entries: only publishedAt can be updated';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_matching_outbox_publish_only
  BEFORE UPDATE ON matching_outbox_entries
  FOR EACH ROW
  EXECUTE FUNCTION matching_outbox_block_non_publish_updates();

-- DELETE strict : purge outbox > X jours via cleanup job autorisé.
-- (pas de trigger BLOCK ; cf. GRANT plus bas)

-- ---------------------------------------------------------------------
-- 4. Rôle applicatif app_matching (least privilege)
-- ---------------------------------------------------------------------
-- Création conditionnelle (rôle peut exister déjà si rejoué).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_matching') THEN
    CREATE ROLE app_matching;
  END IF;
END
$$;

-- SELECT + INSERT sur toutes les tables matching_*
GRANT SELECT, INSERT ON
  matching_results,
  matching_result_entries,
  matching_audit_entries,
  matching_outbox_entries
TO app_matching;

-- UPDATE accordé sur matching_results (supersededAt chain) et
-- matching_outbox_entries (publishedAt set par worker publisher).
-- Le trigger conditionnel ci-dessus filtre les UPDATE non-autorisés.
GRANT UPDATE ON
  matching_results,
  matching_outbox_entries
TO app_matching;

-- DELETE strict : purge outbox > 90 jours (rétention logs applicatifs).
GRANT DELETE ON matching_outbox_entries TO app_matching;

-- REVOKE explicite UPDATE/DELETE sur matching_audit_entries (défense
-- en profondeur même si trigger row-level bloque).
REVOKE UPDATE, DELETE ON matching_audit_entries FROM app_matching;

-- Sequences (UUID @default(uuid()) côté client mais sécurise évolution)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_matching;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_matching;

-- ---------------------------------------------------------------------
-- 5. Lectures cross-module (Principe V — passage par facade publique)
-- ---------------------------------------------------------------------
-- L'API matching consomme :
--   - auth_users : soft FK pour audit (admin actor du re-matching)
--   - profile_conseiller_profiles : ConseillerSnapshot (T059)
--   - profile_languages / profile_specialities / profile_geo_zones :
--     M-N tables d'alimentation snapshot
--   - conformite_conseiller_compliances : filtre verified via
--     ConformiteQueryPort + fallback siège social (R5 hiérarchie)
--   - intake_voyageur_briefs + intake_voyageur_contacts : BriefSnapshot
--     (T058 — postal code voyageur, destinations, langue, spécialité, familiarité)
--
-- Aucune écriture cross-module n'est accordée.

GRANT SELECT ON
  auth_users,
  auth_sessions,
  profile_conseiller_profiles,
  profile_languages,
  profile_specialities,
  profile_geo_zones,
  conformite_conseiller_compliances,
  intake_voyageur_briefs,
  intake_voyageur_contacts
TO app_matching;
