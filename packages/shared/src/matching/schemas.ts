// T017 — Schémas Zod du module matching (feature 011).
//
// 4 outbox payloads + 1 AdminRematchRequest. Tous validés au runtime à la
// frontière (insert outbox, consume bus, parsing HTTP).
//
// Cf. specs/008-matching-scoring/contracts/outbox-events.md (4 events) et
// contracts/http-endpoints.md (admin re-match endpoint).

import { z } from 'zod';
import { MatchingResultEntryIdSchema, MatchingResultIdSchema } from './branded-ids';

// ---------------------------------------------------------------------------
// IDs cross-module — réutilisation des brands intake / profil
// ---------------------------------------------------------------------------
// On ne re-déclare PAS VoyageurBriefId / ConseillerId ici (déjà publiés par
// @cv/shared/intake et @cv/shared/conformite). On utilise z.string().uuid()
// localement et les consommateurs castent vers leur brand respectif.

const UuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// Champs communs
// ---------------------------------------------------------------------------

const AlgorithmVersionSchema = z
  .string()
  .regex(/^v\d+\.\d+$/, 'Algorithm version must follow vMAJOR.MINOR (ex. v1.0)');

const ScoreFinalSchema = z.number().min(0).max(1.1);

const MatchingEntryCommonSchema = z.object({
  position: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  conseillerId: UuidSchema,
  scoreFinal: ScoreFinalSchema,
  boosted: z.boolean(),
});

// ---------------------------------------------------------------------------
// 1. voyageur.brief.matched — top 3 complet, status=ok
// ---------------------------------------------------------------------------

export const OutboxMatchedPayloadSchema = z.object({
  matchingResultId: MatchingResultIdSchema,
  briefId: UuidSchema,
  matchedCount: z.literal(3),
  algorithmVersion: AlgorithmVersionSchema,
  computedAt: z.string().datetime(),
  entries: z.array(MatchingEntryCommonSchema).length(3),
  boostApplied: z.boolean(),
});

export type OutboxMatchedPayload = z.infer<typeof OutboxMatchedPayloadSchema>;

// ---------------------------------------------------------------------------
// 2. voyageur.brief.partially_matched — 1 ou 2 entries, status=partial
// ---------------------------------------------------------------------------

export const OutboxPartiallyMatchedPayloadSchema = z.object({
  matchingResultId: MatchingResultIdSchema,
  briefId: UuidSchema,
  matchedCount: z.union([z.literal(1), z.literal(2)]),
  algorithmVersion: AlgorithmVersionSchema,
  computedAt: z.string().datetime(),
  entries: z
    .array(
      MatchingEntryCommonSchema.extend({
        position: z.union([z.literal(1), z.literal(2)]),
      }),
    )
    .min(1)
    .max(2),
  boostApplied: z.boolean(),
  reason: z.enum([
    'insufficient_verified_conseillers',
    'language_filter_excluded_too_many',
    'destination_no_specialist',
    'multiple_factors',
  ]),
});

export type OutboxPartiallyMatchedPayload = z.infer<typeof OutboxPartiallyMatchedPayloadSchema>;

// ---------------------------------------------------------------------------
// 3. voyageur.brief.unmatched — 0 entry, status=empty
// ---------------------------------------------------------------------------

export const OutboxUnmatchedPayloadSchema = z.object({
  matchingResultId: MatchingResultIdSchema,
  briefId: UuidSchema,
  matchedCount: z.literal(0),
  algorithmVersion: AlgorithmVersionSchema,
  computedAt: z.string().datetime(),
  reason: z.enum([
    'no_verified_conseillers_at_all',
    'no_conseiller_speaks_requested_language',
    'no_conseiller_covers_destination',
    'multiple_factors',
  ]),
  candidatesEvaluatedCount: z.number().int().min(0),
});

export type OutboxUnmatchedPayload = z.infer<typeof OutboxUnmatchedPayloadSchema>;

// ---------------------------------------------------------------------------
// 4. voyageur.brief.all_matches_revoked — Q4 cascade révocation
// ---------------------------------------------------------------------------

export const OutboxAllMatchesRevokedPayloadSchema = z.object({
  matchingResultId: MatchingResultIdSchema,
  briefId: UuidSchema,
  algorithmVersion: AlgorithmVersionSchema,
  originalComputedAt: z.string().datetime(),
  revokedAt: z.string().datetime(),
  revokedConseillerIds: z.array(UuidSchema).length(3),
});

export type OutboxAllMatchesRevokedPayload = z.infer<typeof OutboxAllMatchesRevokedPayloadSchema>;

// ---------------------------------------------------------------------------
// 5. AdminRematchRequest — body POST /api/matching/admin/briefs/:id/re-match
// ---------------------------------------------------------------------------

export const AdminRematchRequestSchema = z.object({
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters (audit trail)')
    .max(500, 'Reason must be at most 500 characters'),
});

export type AdminRematchRequest = z.infer<typeof AdminRematchRequestSchema>;

export const AdminRematchResponseSchema = z.object({
  newMatchingResultId: MatchingResultIdSchema,
  previousMatchingResultId: MatchingResultIdSchema,
  status: z.enum(['ok', 'partial', 'empty']),
  matchedCount: z.number().int().min(0).max(3),
  computedAt: z.string().datetime(),
});

export type AdminRematchResponse = z.infer<typeof AdminRematchResponseSchema>;

// ---------------------------------------------------------------------------
// MatchingResultEntryIdSchema réexporté (utile pour les contracts)
// ---------------------------------------------------------------------------

export { MatchingResultEntryIdSchema };
