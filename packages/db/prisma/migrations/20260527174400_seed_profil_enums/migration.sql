-- Migration seed_profil_enums — feature 005 / dossier 007.
--
-- Seed initial des énumérations versionnées (spécialités, zones, langues).
-- Le porteur projet peut compléter/affiner ces valeurs avant la première
-- mise en production. L'évolution ultérieure se fait par PR éditoriale
-- (nouvelle migration INSERT/UPDATE).
--
-- Convention : codes en kebab-case ASCII, labels FR-CA avec accents.
-- ON CONFLICT DO NOTHING pour idempotence (relance migration sans effet).
--
-- Cf. specs/007-profil-conseiller/data-model.md Migration 2.

-- =====================================================================
-- profile_specialities (12 codes)
-- =====================================================================

INSERT INTO "profile_specialities" ("code", "labelFr", "ordre", "actif") VALUES
  ('croisiere', 'Croisière', 10, true),
  ('famille', 'Famille', 20, true),
  ('aventure', 'Aventure', 30, true),
  ('luxe', 'Luxe', 40, true),
  ('lune-miel', 'Lune de miel', 50, true),
  ('safari', 'Safari', 60, true),
  ('ski', 'Ski', 70, true),
  ('plage-soleil', 'Plage et soleil', 80, true),
  ('culturel', 'Voyage culturel', 90, true),
  ('gastronomique', 'Voyage gastronomique', 100, true),
  ('voyage-solo', 'Voyage solo', 110, true),
  ('ecotourisme', 'Écotourisme', 120, true)
ON CONFLICT ("code") DO NOTHING;

-- =====================================================================
-- profile_geo_zones (12 codes)
-- =====================================================================

INSERT INTO "profile_geo_zones" ("code", "labelFr", "ordre", "actif") VALUES
  ('canada', 'Canada', 10, true),
  ('etats-unis', 'États-Unis', 20, true),
  ('caraibes', 'Caraïbes', 30, true),
  ('mexique', 'Mexique', 40, true),
  ('amerique-centrale', 'Amérique centrale', 50, true),
  ('amerique-sud', 'Amérique du Sud', 60, true),
  ('europe-ouest', 'Europe de l''Ouest', 70, true),
  ('europe-est', 'Europe de l''Est', 80, true),
  ('asie-sud-est', 'Asie du Sud-Est', 90, true),
  ('asie-orient', 'Extrême-Orient', 100, true),
  ('afrique-nord', 'Afrique du Nord', 110, true),
  ('afrique-australe', 'Afrique australe', 120, true)
ON CONFLICT ("code") DO NOTHING;

-- =====================================================================
-- profile_languages (6 codes — ISO 639-1)
-- =====================================================================

INSERT INTO "profile_languages" ("code", "labelFr", "ordre", "actif") VALUES
  ('fr', 'Français', 10, true),
  ('en', 'Anglais', 20, true),
  ('es', 'Espagnol', 30, true),
  ('pt', 'Portugais', 40, true),
  ('it', 'Italien', 50, true),
  ('de', 'Allemand', 60, true)
ON CONFLICT ("code") DO NOTHING;
