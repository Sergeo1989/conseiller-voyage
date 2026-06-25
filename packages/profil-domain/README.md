# @cv/profil-domain

Logique pure du domaine de **profil conseiller** — feature 005 (roadmap),
spec `specs/007-profil-conseiller/`.

## Principe

Aucun framework, aucune I/O, aucune dépendance Prisma / Next.js / NestJS.
Toutes les fonctions sont **déterministes** et **TDD strict** (Principe VI
de la constitution v2.3.0) : tests RED commités séparément des
implémentations GREEN.

Conséquence : `@cv/profil-domain` peut être consommé indifféremment depuis
le backend NestJS, depuis les Server Actions Next.js, ou depuis les tests
sans setup d'infrastructure (Postgres, Redis, S3).

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

## Pattern `Result<T, E>`

Toutes les fonctions qui peuvent échouer renvoient un `Result` typé
plutôt que de `throw`. Ça force le caller à gérer explicitement le cas
d'erreur au niveau du système de types, sans `try/catch` invisible.

```ts
import { ok, err, type Result } from '@cv/profil-domain';

type SlugError = 'NOM_VIDE' | 'NOM_TROP_LONG' | 'CARACTERES_INVALIDES';

function genererSlug(prenom: string, nom: string): Result<string, SlugError> {
  if (prenom.length === 0 || nom.length === 0) return err('NOM_VIDE');
  if (prenom.length + nom.length > 100) return err('NOM_TROP_LONG');
  return ok(`${prenom}-${nom}`.toLowerCase());
}

// Côté consommateur (cas d'usage applicatif) :
const r = genererSlug('Marie', 'Dupont');
if (!r.ok) {
  // r.error: 'NOM_VIDE' | 'NOM_TROP_LONG' | 'CARACTERES_INVALIDES' — typé exhaustif
  return { kind: 'validation_error', code: r.error };
}
// r.value: string — discriminé par r.ok = true
const slug = r.value;
```

Le pattern `Result` cohabite avec la convention `ActionResult<T>` côté
front (`apps/web/src/shared/lib/result.ts`) qui sert le même but mais
au niveau frontière Server Action → Client Component.

## Intention TDD (Principe VI)

Chaque fonction métier sensible **DOIT** suivre le cycle Red → Green →
Refactor, avec commits séparés visibles dans `git log`. Exemple
historique :

```text
$ git log --oneline -- packages/profil-domain/src/slug.ts \
                       packages/profil-domain/tests/slug.test.ts
abc1234 test(profil-domain): slug — accents fold + collisions FIFO (RED)
def5678 feat(profil-domain): slug — implémentation slugify + genererSlugUnique
9012345 refactor(profil-domain): slug — extraire helper isReserved
```

Le commit RED est commité **avant** l'implémentation et fait échouer
la CI. Le commit GREEN est commité ensuite et fait passer la CI. Le
refactor (optionnel) garde la CI verte. Ce séquencement est visible
en revue et constitue une preuve TDD.

Couverture cible : ≥ 95 % `lines` / `functions` / `statements`,
≥ 90 % `branches` (cf. `vitest.config.ts`). Toute branche métier sensible
sans test associé est un défaut bloquant à la revue.

## Dépendances cross-module

- **Consommateurs** :
  - `apps/api/src/modules/identite/` (cas d'usage profil)
  - `apps/web/src/features/profil-conseiller/` (Server Actions + forms RHF)
  - `apps/web/src/features/profil-public/` (cookie cv_suggested)
- **Aucune dépendance sortante** au-delà de `zod` (pour les DTOs).
- **Lecture du nom légal** d'un conseiller : via le port
  `AuthUserLegalNameReader` côté application (pas dans ce package,
  qui reste pur — le port est défini sous
  `apps/api/src/modules/identite/application/ports/`).

## Tester localement

```bash
pnpm --filter @cv/profil-domain test           # vitest run
pnpm --filter @cv/profil-domain test --watch   # mode TDD
pnpm --filter @cv/profil-domain test --coverage
```

## Références

- [Spec feature 007 (profil conseiller)](../../specs/007-profil-conseiller/spec.md)
- [Plan d'implémentation](../../specs/007-profil-conseiller/plan.md)
- [Data model](../../specs/007-profil-conseiller/data-model.md)
- [Constitution v2.3.0 — Principe VI (Logique métier déterministe et testée)](../../.specify/memory/constitution.md)
- [ADR-0015 — Conservation du slug réservé après effacement Loi 25](../../docs/adr/0015-slug-reserve-loi25.md)
