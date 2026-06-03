-- T015 (feature 008-matching-scoring) — Ajout `codePostal` sur
-- `profile_conseiller_profiles` (extension cross-module Mode A, cf. ADR-0024).
--
-- La feature 011 matching nécessite un code postal conseiller pour calculer
-- la distance Haversine vers le code postal voyageur (ADR-0021). Aucune
-- source de code postal n'existait jusqu'ici dans le système (ni 001
-- conformite ni 007 profil).
--
-- Décision (Mode A ADR-0024) : ajouter `codePostal` nullable sur
-- ConseillerProfile. Profils existants restent valides ; les conseillers
-- sans codePostal sont exclus du matching avec audit
-- `matching.conseiller_address_missing` (FR-009c) jusqu'à saisie.
--
-- UX follow-up (hors scope 011, PR satellite séparée sur 007) :
-- ajouter le champ au formulaire d'édition profil conseiller +
-- prompt onboarding pour les profils existants.
--
-- Format : VarChar(7) pour accepter `A1A 1A1` (7 chars) OU `A1A1A1`
-- (6 chars) côté DB. Validation stricte regex côté Zod / formulaire.

ALTER TABLE "profile_conseiller_profiles"
  ADD COLUMN "codePostal" VARCHAR(7);
