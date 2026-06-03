# `@cv/shared/matching`

Surface publique partagée du module **matching** (feature 011 roadmap — Tier 2 boucle économique cœur).

## Rôle

Expose les types, schemas Zod et interfaces nécessaires pour intégrer le matching avec :

- **intake (008)** — extension US5 dashboard admin pour la file de briefs non-matchés.
- **notifications (012, futur)** — consomme les 4 events outbox `voyageur.brief.matched|partially_matched|unmatched|all_matches_revoked` pour notifier les conseillers.
- **espace voyageur (015, futur)** — lit le `MatchingResult` via `MatchingQueryPort` (filtrage dynamique verified).

## Contenu (sera matérialisé en Phase 2)

| Fichier | Rôle | Phase |
|---|---|---|
| `branded-ids.ts` | `MatchingResultId`, `MatchingResultEntryId`, `MatchingAuditEntryId`, `MatchingOutboxEntryId`, `FsaCode` | T016 |
| `schemas.ts` | Zod payloads des 4 events outbox + `AdminRematchRequest` | T017 |
| `contracts.ts` | Interface `MatchingQueryPort` + token DI `MATCHING_QUERY_PORT` | T018 |
| `event-names.ts` | Mapping `MatchingOutboxEventType` enum DB ⇄ event bus | T019 |
| `fsa-centroids.json` | ~1 622 FSA canadiens × {lat, lng, province} (StatCan OGL-Canada, cf. ADR-0022) | T004 |
| `index.ts` | Barrel re-exports propres | T020 |

## Convention d'import

```ts
// ✅ Préférer les sous-chemins (tree-shakable, scope explicite)
import { MatchingResultId, FsaCode } from '@cv/shared/matching/branded-ids';
import { MATCHING_QUERY_PORT } from '@cv/shared/matching/contracts';

// ❌ Éviter le barrel root tant que vide
// import { ... } from '@cv/shared/matching';  // résoudra à index.ts vide jusqu'en T020
```

## Couverture cible

100 % des types et schemas du module sont consommés par au moins un test côté `apps/api/src/modules/matching/*` ou par un futur module client.

## ADRs

- [ADR-0020](../../../../docs/adr/0020-matching-scoring-weights.md) — pondération initiale des 4 axes scorés
- [ADR-0021](../../../../docs/adr/0021-fsa-haversine-distance.md) — algorithme distance Haversine
- [ADR-0022](../../../../docs/adr/0022-fsa-centroids-statcan-source.md) — source FSA centroïdes StatCan OGL-Canada
- [ADR-0023](../../../../docs/adr/0023-matching-anonymisation-cascade.md) — trigger Postgres anonymisation cascade
- [ADR-0024](../../../../docs/adr/0024-matching-cross-module-extensions.md) — extensions cross-module 011
