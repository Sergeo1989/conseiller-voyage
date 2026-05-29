# `@cv/shared/intake`

Sous-paquet partagé du module **intake / préqualification voyageur** (feature
002 — branche `002-voyageur-intake`).

Consommé par `apps/api` (validation Zod côté NestJS, contrats ports) et
`apps/web` (validation Zod côté Server Actions, formatters i18n). Aucune
dépendance framework (NestJS, Next.js, Prisma) — logique pure conformément
à Clean Architecture / Principe VIII.

## Contenu cible (Phase 2 + 3)

| Fichier | Tâche | État |
|---|---|---|
| `branded-ids.ts` | T017-T018 | ⏳ |
| `schemas.ts` (SubmitBrief, VerifyMagicLink, Resend, ErasureRequest, ErasureRequestAll, AdminPushManual) | T019-T020 | ⏳ |
| `contracts.ts` (IntakeQueryPort, BriefSummary) | T021 | ⏳ |
| `formatters.ts` (budget, spécialité, familiarité FR-CA/EN) | T022 | ⏳ |
| `disposable-emails-snapshot.json` (fallback R3) | T099 | ⏳ |

## Couverture cible (Principe VI — TDD strict)

| Métrique | Seuil |
|---|---|
| Lines | ≥ 95 % |
| Functions | ≥ 95 % |
| Statements | ≥ 95 % |
| Branches | ≥ 90 % |

Vérifié par `pnpm --filter @cv/shared test --coverage` en CI. Seuils
hérités du sous-paquet `conformite` (feature 001 mergée, retour
d'expérience).

## Convention TDD (Principe VI)

Tests **RED** (test qui échoue) avant **GREEN** (implémentation minimale)
avant **REFACTOR**. Chaque triplet en commits Git séparés visibles dans
le log, pas en un seul commit `feat: …`. Aucune exception sur les
fonctions critiques :

- `validateBriefSubmission` (règles métier au-delà du schema Zod)
- `signMagicLink` / `verifyMagicLink` (HMAC SHA-256)
- `computeBriefExpiration` (J+90 stable)

## Importer

```ts
// Schemas Zod côté serveur
import { SubmitBriefSchema, type SubmitBriefPayload } from '@cv/shared/intake';

// Formatters côté UI (Server ou Client Component)
import { formatBudgetRange, formatSpeciality } from '@cv/shared/intake';
```

Importer **uniquement** via le barrel (`@cv/shared/intake`) ou via un
sous-chemin défini dans `package.json` (`@cv/shared/intake/schemas`). Pas
d'import profond de fichiers `.ts` internes (vérifié par
`tools/check-feature-boundaries.ts` côté Web et `check-module-boundaries.ts`
côté API).
