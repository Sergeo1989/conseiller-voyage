// @cv/shared/matching — public surface du module matching (feature 011).
//
// Ce namespace est consommé par :
//   - apps/api/src/modules/matching/*   (le module producteur)
//   - apps/api/src/modules/intake/*     (US5 admin extension — file briefs non-matchés)
//   - apps/api/src/modules/notifications-transactionnelles/*  (012 futur)
//   - apps/web/src/app/(voyageur)/voyage/*  (015 futur)
//
// Surface exposée (à compléter en Phase 2 T016-T020) :
//   - branded IDs : MatchingResultId, MatchingResultEntryId, etc.
//   - schemas Zod : payloads outbox (4 events) + AdminRematchRequest
//   - contracts : MatchingQueryPort interface + Symbol DI
//   - event-names : mapping enum DB ⇄ event bus
//   - fsa-centroids : fichier statique des centroïdes FSA canadiens (~1 622 entrées)
//
// Tant que les sous-modules ne sont pas écrits (T016-T020), ce barrel est vide.
// Importer directement les sous-chemins (`@cv/shared/matching/branded-ids`,
// `@cv/shared/matching/schemas`, etc.) une fois disponibles.

export {};
