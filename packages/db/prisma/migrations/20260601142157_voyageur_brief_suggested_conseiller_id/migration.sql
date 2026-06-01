-- T069 (feature 008-matching-scoring / US2) — Ajout `suggestedConseillerId`
-- sur `intake_voyageur_briefs` (extension cross-module Mode A, cf. ADR-0024).
--
-- Le matching feature 011 applique un boost ≤ +10 % (FR-011) à ce conseiller
-- s'il est éligible (verified + langue + adresse) au moment du calcul.
-- L'ID est figé au moment de la soumission par 008 (T070) via la lecture
-- du cookie cv_suggested HMAC posé par 007.
--
-- Nullable : tous les briefs antérieurs restent valides (suggestedConseillerId
-- = NULL → pas de boost, no-op côté matching). Aucun back-fill requis.

ALTER TABLE "intake_voyageur_briefs"
  ADD COLUMN "suggestedConseillerId" UUID;
