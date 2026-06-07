-- T009 — Trigger anonymisation cascade brief → leads (feature 012, FR-009).
-- Cf. specs/012-lead-notifications-state-machine/research.md R6 + ADR-0026.
-- Pattern hérité de 20260531133023_matching_anonymisation_cascade (ADR-0023).
--
-- Quand un brief voyageur passe à status='anonymized' (Loi 25, feature 008),
-- les leads liés voient leur pointeur PII `briefId` nullifié. Le MR a déjà été
-- nullifié par le trigger matching (011) ; ici on neutralise les leads.
--
-- IMPORTANT : ce trigger NE TOUCHE JAMAIS `lead_transitions` — la piste
-- d'audit Loi 25 reste intacte (rétention, constitution). C'est un trigger
-- distinct de matching_anonymise_cascade (les deux fonctions cohabitent).

CREATE OR REPLACE FUNCTION lead_anonymise_cascade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Uniquement sur la transition vers 'anonymized'.
  IF OLD."status" = 'anonymized' OR NEW."status" != 'anonymized' THEN
    RETURN NEW;
  END IF;

  -- Neutralise le pointeur PII sur les leads du brief. lead_transitions
  -- (audit) JAMAIS modifié.
  UPDATE "leads"
     SET "briefId" = NULL
   WHERE "briefId" = OLD."id";

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lead_anonymise_cascade
  AFTER UPDATE OF "status" ON "intake_voyageur_briefs"
  FOR EACH ROW
  EXECUTE FUNCTION lead_anonymise_cascade();
