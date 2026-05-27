-- Migration profil_immutability_triggers — feature 005 / dossier 007-profil-conseiller.
--
-- Pose les invariants Postgres complémentaires sur les tables profil créées
-- par la migration init_db (20260527174136) :
--
--   1. profile_conseiller_profiles :
--      - slug immutable post-publication (FR-015 + SC-007)
--      - statut 'anonymise' terminal (FR-016 + Principe II Loi 25)
--      - check constraint : raisonMasquageAdmin cohérent avec statut
--   2. profile_slug_reservations : append-only (anti-réutilisation Loi 25)
--   3. profile_moderation_audits  : append-only (Principe IX audit immuable)
--
-- Pattern hérité de 001 (audit conformite) + 002 (auth_audit_events) +
-- 002a (mfa_audit_events).
--
-- Procédure de rollback exceptionnelle (DROP TRIGGER → opération → recréer) :
-- voir docs/runbooks/profil-anonymisation-loi25.md (à livrer T149).

-- =====================================================================
-- 1. profile_conseiller_profiles — slug immutable + anonymise terminal
-- =====================================================================

CREATE OR REPLACE FUNCTION prevent_profil_slug_mutation_after_publish()
RETURNS TRIGGER AS $$
BEGIN
  -- Le slug est posé une fois (au 1er passage `pret`) puis figé pour la vie.
  -- Cf. FR-015 + SC-007 (slug réservé Loi 25 jamais réattribué).
  IF OLD.slug IS NOT NULL AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'Slug immuable post-publication : profil_id=% ancien=% nouveau=%',
      OLD.id, OLD.slug, NEW.slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profile_slug_immutable
  BEFORE UPDATE ON "profile_conseiller_profiles"
  FOR EACH ROW EXECUTE FUNCTION prevent_profil_slug_mutation_after_publish();

CREATE OR REPLACE FUNCTION prevent_profil_unanonymize()
RETURNS TRIGGER AS $$
BEGIN
  -- Le statut 'anonymise' est terminal : aucune transition vers un autre
  -- statut autorisée (FR-016 + Principe II Loi 25).
  IF OLD.statut = 'anonymise' AND NEW.statut IS DISTINCT FROM 'anonymise' THEN
    RAISE EXCEPTION 'Statut anonymise est terminal : profil_id=% tentative=%',
      OLD.id, NEW.statut;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profile_anonymise_terminal
  BEFORE UPDATE ON "profile_conseiller_profiles"
  FOR EACH ROW EXECUTE FUNCTION prevent_profil_unanonymize();

-- Check constraint : raisonMasquageAdmin OBLIGATOIRE si statut=masque_admin,
-- et OBLIGATOIREMENT NULL sinon (FR-023 cohérence).
ALTER TABLE "profile_conseiller_profiles"
  ADD CONSTRAINT "chk_profile_raison_masquage_coherence"
  CHECK (
    ("statut" = 'masque_admin' AND "raisonMasquageAdmin" IS NOT NULL)
    OR
    ("statut" <> 'masque_admin' AND "raisonMasquageAdmin" IS NULL)
  );

-- =====================================================================
-- 2. profile_slug_reservations — append-only (Loi 25 anti-réutilisation)
-- =====================================================================

CREATE OR REPLACE FUNCTION reject_profile_slug_reservation_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'profile_slug_reservations est append-only — TG_OP=% rejeté sur la table %',
    TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profile_slug_reservations_no_update
  BEFORE UPDATE ON "profile_slug_reservations"
  FOR EACH ROW EXECUTE FUNCTION reject_profile_slug_reservation_mutation();

CREATE TRIGGER profile_slug_reservations_no_delete
  BEFORE DELETE ON "profile_slug_reservations"
  FOR EACH ROW EXECUTE FUNCTION reject_profile_slug_reservation_mutation();

CREATE TRIGGER profile_slug_reservations_no_truncate
  BEFORE TRUNCATE ON "profile_slug_reservations"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_profile_slug_reservation_mutation();

-- =====================================================================
-- 3. profile_moderation_audits — append-only (Principe IX audit immuable)
-- =====================================================================

CREATE OR REPLACE FUNCTION reject_profile_moderation_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'profile_moderation_audits est append-only — TG_OP=% rejeté sur la table %',
    TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profile_moderation_audits_no_update
  BEFORE UPDATE ON "profile_moderation_audits"
  FOR EACH ROW EXECUTE FUNCTION reject_profile_moderation_audit_mutation();

CREATE TRIGGER profile_moderation_audits_no_delete
  BEFORE DELETE ON "profile_moderation_audits"
  FOR EACH ROW EXECUTE FUNCTION reject_profile_moderation_audit_mutation();

CREATE TRIGGER profile_moderation_audits_no_truncate
  BEFORE TRUNCATE ON "profile_moderation_audits"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_profile_moderation_audit_mutation();
