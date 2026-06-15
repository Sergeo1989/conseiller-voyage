// T001 [016] — Types partagés de l'enrichissement LLM de l'intake (roadmap 009).
//
// Aucun champ texte libre ni langue détectée (minimisation Loi 25, révisions
// 2026-06-15) : seules des intentions STRUCTURÉES (spécialité canonique +
// destinations) sont produites/persistées. La sortie LLM est NON FIABLE et
// validée contre `EnrichedIntentionsSchema` avant tout usage (FR-006).

import { z } from 'zod';
import { TravelSpecialitySchema } from './schemas';

// Statut d'un enrichissement de brief (persisté quel que soit le résultat).
export const EnrichmentStatusSchema = z.enum(['enrichi', 'partiel', 'non_enrichi', 'indisponible']);
export type EnrichmentStatus = z.infer<typeof EnrichmentStatusSchema>;

// Cause de repli quand le statut n'est pas `enrichi` (observabilité).
export const EnrichmentFailureReasonSchema = z.enum([
  'timeout',
  'unavailable',
  'schema_invalid',
  'low_confidence',
  'empty_input',
]);
export type EnrichmentFailureReason = z.infer<typeof EnrichmentFailureReasonSchema>;

// Spécialité CANONIQUE = taxonomie matching SANS `autre` : résoudre `autre`
// est précisément l'objet de l'enrichissement (cf. data-model R1).
export const CanonicalSpecialitySchema = TravelSpecialitySchema.exclude(['autre']);
export type CanonicalSpeciality = z.infer<typeof CanonicalSpecialitySchema>;

// Seuil de confiance commun : en deçà, l'enrichi n'est ni marqué `enrichi`
// (use case intake) ni consommé par le scoring (merge matching). Source unique
// pour garder intake et matching alignés. Calibration : ADR-0028 (point ouvert).
export const ENRICHMENT_CONFIDENCE_THRESHOLD = 0.7;

// Schéma CIBLE imposé au `LlmProvider`, validé avant persistance/usage (FR-006).
// `.strict()` rejette toute clé inattendue (anti-injection / anti-PII).
// `destinations` : noms/pays normalisés (lettres/espaces/traits d'union) — un
// courriel/téléphone/montant n'y matche pas (renfort SC-004).
export const EnrichedIntentionsSchema = z
  .object({
    speciality: CanonicalSpecialitySchema.optional(),
    destinations: z
      .array(z.string().regex(/^[\p{L} .'-]{2,56}$/u))
      .max(10)
      .optional(),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type EnrichedIntentions = z.infer<typeof EnrichedIntentionsSchema>;

// Vue publique exposée au matching (port `BriefEnrichmentQueryPort`). Minimale :
// aucun texte libre, aucune PII, aucun montant — seul ce dont le scoring a besoin.
export interface BriefEnrichmentView {
  readonly briefId: string;
  readonly status: EnrichmentStatus;
  readonly enrichedSpeciality: CanonicalSpeciality | null;
  readonly enrichedDestinations: ReadonlyArray<string>;
  readonly confidence: number;
}

// Port PUBLIC inter-module (Principe V) : le matching (011) lit l'enrichi via
// cette interface uniquement. Vit dans @cv/shared pour éviter tout import profond
// cross-module (cf. CONFORMITE_QUERY_PORT / CONVERSATION_QUERY_PORT).
export interface BriefEnrichmentQueryPort {
  getByBriefId(briefId: string): Promise<BriefEnrichmentView | null>;
}

export const BRIEF_ENRICHMENT_QUERY_PORT = Symbol.for('BriefEnrichmentQueryPort');
