-- T014 — Trigger anonymisation cascade brief → matching (ADR-0023).
-- Cf. specs/008-matching-scoring/spec.md FR-020 + Loi 25 assumption.
--
-- Quand un brief voyageur passe à status='anonymized' (FR-022/FR-022a de
-- feature 008), tout MatchingResult lié doit voir ses pointeurs PII
-- nullifiés et ses scoreComponents redactés. Le MatchingResult lui-même
-- reste en base (audit 7 ans), seules les liaisons PII disparaissent.
--
-- IMPORTANT : ce trigger NE TOUCHE PAS à matching_audit_entries — le
-- journal d'audit Loi 25 reste intact (rétention 7 ans, constitution).

CREATE OR REPLACE FUNCTION matching_anonymise_cascade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_affected_ids UUID[];
BEGIN
  -- Trigger uniquement sur la transition vers 'anonymized'
  IF OLD."status" = 'anonymized' OR NEW."status" != 'anonymized' THEN
    RETURN NEW;
  END IF;

  -- 1. Capture les MR concernés (pour update entries après)
  SELECT ARRAY_AGG("id")
    INTO v_affected_ids
    FROM "matching_results"
   WHERE "briefId" = OLD."id";

  IF v_affected_ids IS NULL OR cardinality(v_affected_ids) = 0 THEN
    -- Aucun MR pour ce brief — rien à faire
    RETURN NEW;
  END IF;

  -- 2. Nullifier briefId + suggestedConseillerId sur les MR
  UPDATE "matching_results"
     SET "briefId" = NULL,
         "suggestedConseillerId" = NULL
   WHERE "id" = ANY(v_affected_ids);

  -- 3. Redacter scoreComponents sur les entries (signal potentiellement PII)
  UPDATE "matching_result_entries"
     SET "scoreComponents" = '{"redacted":"loi25"}'::jsonb
   WHERE "matchingResultId" = ANY(v_affected_ids);

  -- NB : matching_audit_entries NON touchée — audit Loi 25 préservé.

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_matching_anonymise_cascade
  AFTER UPDATE OF "status" ON "intake_voyageur_briefs"
  FOR EACH ROW
  EXECUTE FUNCTION matching_anonymise_cascade();
