# @cv/profil-domain

Logique pure du domaine de **profil conseiller** — feature 005 (roadmap),
spec `specs/007-profil-conseiller/`.

## Principe

Aucun framework, aucune I/O, aucune dépendance Prisma / Next.js / NestJS.
Toutes les fonctions sont **déterministes** et **TDD strict** (Principe VI
de la constitution v2.2.0) : tests RED commités séparément des
implémentations GREEN.

## Modules

| Module | Rôle |
|---|---|
| `result` | Type `Result<T, E>` (discriminated union) + helpers `ok` / `err`. Convention de retour pour les use cases côté application (`apps/api/src/modules/identite/application/use-cases/profil-*`). |
| `slug` | `slugify` FR-CA (ASCII fold accents + `œ`/`æ`) + `genererSlugUnique` avec collision FIFO numérique + `SLUGS_RESERVES_FRAMEWORK` (anti-collision avec routes Next.js statiques `profil`, `admin`, etc.). |
| `magic-number` | `detecterFormatImage` : validation des 12 premiers octets pour distinguer JPEG / PNG / WebP (RIFF + WEBP, anti faux positif WAV/AVI). |
| `statut-profil` | `calculerStatutProfil` (matrice 4 booléens → enum 4 valeurs) + `profilEstComplet` (boolean). |
| `nom-affiche` | `formaterNomAffiche` : `Prénom + initiale-nom + "."` par défaut (FR-CA), ou nom complet si toggle activé. Gère les noms composés (`Le Goff`, `St-Pierre`, `de la Tour`). |
| `suggested-window` | `fenetreValiditeSuggested` : vrai si timestamp < 24 h dans le passé. |
| `suggested-cookie` | `encodeSuggestedCookie` / `decodeSuggestedCookie` : payload JSON + HMAC SHA-256 + base64url. FIFO ≤ 10 entrées. |
| `dtos/` | Schémas Zod partagés (consommés par les Server Actions Next.js et les controllers NestJS). |

## Couverture cible

≥ 95 % `lines` / `functions` / `statements`, ≥ 90 % `branches` (cf.
`vitest.config.ts`). Toute fonction métier sensible doit avoir des
tests RED → GREEN visibles en commits séparés.

## Dépendances cross-module

- `@cv/profil-domain` est consommé par `apps/api/src/modules/identite/`
  (use cases) et `apps/web/src/app/` (Server Actions + composants form).
- Lecture du nom légal du conseiller : via le port
  `AuthUserLegalNameReader` côté application (pas dans ce package, qui
  reste pur).

Cf. plan d'implémentation complet : `specs/007-profil-conseiller/plan.md`.
