-- T032 [016] — Trigger anonymisation cascade brief → enrichissement (Loi 25, FR-015).
-- Pattern hérité de 20260605120002_lead_anonymisation_cascade (ADR-0023/0026).
--
-- Quand un brief voyageur passe à status='anonymized' (feature 008), l'enrichissement
-- lié est neutralisé : les destinations enrichies (préférence personnelle, Loi 25)
-- sont vidées et `redactedAt` est horodaté. La surface est minimale (aucun texte
-- libre ni langue n'est stocké). `enrichedSpeciality` reste (catégorie anonyme).
--
-- Idempotent : ne s'exécute qu'à la transition vers 'anonymized'.

CREATE OR REPLACE FUNCTION brief_enrichment_anonymise_cascade()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'anonymized' OR NEW."status" != 'anonymized' THEN
    RETURN NEW;
  END IF;

  UPDATE "intake_brief_enrichments"
     SET "enrichedDestinations" = '[]'::jsonb,
         "redactedAt" = now()
   WHERE "briefId" = OLD."id";

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_brief_enrichment_anonymise_cascade
  AFTER UPDATE OF "status" ON "intake_voyageur_briefs"
  FOR EACH ROW
  EXECUTE FUNCTION brief_enrichment_anonymise_cascade();
