// @cv/shared/matching — public surface du module matching (feature 011).
//
// Phase 2 T020 : barrel re-exports propres. Importable via :
//   import { MATCHING_QUERY_PORT, MatchingResultId } from '@cv/shared/matching';
//
// Ou sous-chemins (préféré pour tree-shaking) :
//   import { MATCHING_QUERY_PORT } from '@cv/shared/matching/contracts';
//   import { MatchingResultId } from '@cv/shared/matching/branded-ids';

export * from './branded-ids';
export * from './contracts';
export * from './event-names';
export * from './schemas';
