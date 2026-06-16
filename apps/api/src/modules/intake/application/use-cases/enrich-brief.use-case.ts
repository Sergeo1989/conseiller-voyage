// T014 [016 US1] — EnrichBriefUseCase : enrichissement best-effort d'un brief.
//
// Orchestration (jamais de logique LLM dans le port) :
//   scrub PII (FR-017) → payload NON identifiant (exclut voyageurContactId, FR-004)
//   → LlmProvider sous budget → validation Zod (FR-006) → statut/confiance → persist.
// Idempotent par briefId (réutilise, 0 appel — SC-005). Best-effort : ne throw jamais
// pour une panne LLM (mode dégradé, Principe X). La publication de
// `voyageur.brief.enriched` est faite par le job appelant (T017), pas ici.

import {
  type CanonicalSpeciality,
  ENRICHMENT_CONFIDENCE_THRESHOLD,
  type EnrichmentFailureReason,
  type EnrichmentStatus,
  type VoyageurBriefId,
} from '@cv/shared/intake';
import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '../../../../common/ports/clock.port';
import { scrubContactPii } from '../../domain/services/scrub-contact-pii';
import { parseEnrichedIntentions } from '../../domain/value-objects/enriched-intentions';
import type {
  BriefEnrichmentRecord,
  BriefEnrichmentRepository,
  EnrichmentMetricsRecorder,
  LlmProvider,
  LlmResult,
  VoyageurBriefReader,
  VoyageurBriefRecord,
} from '../ports';

// Budget LLM (calibration implémentation — ADR-0028, point ouvert).
const MAX_OUTPUT_TOKENS = 400;
const TIMEOUT_MS = 3000;
// T028 — borne du texte d'entrée (maîtrise du coût ; le texte libre du brief est
// déjà plafonné côté DB mais on borne en défense).
const MAX_INPUT_CHARS = 2000;

export interface EnrichBriefInput {
  readonly briefId: VoyageurBriefId;
}

export type EnrichBriefResult =
  | { readonly kind: 'enriched'; readonly status: EnrichmentStatus }
  | { readonly kind: 'reused' }
  | { readonly kind: 'brief_not_found' };

export interface EnrichBriefDeps {
  readonly clock: Clock;
  readonly briefReader: VoyageurBriefReader;
  readonly llm: LlmProvider;
  readonly repo: BriefEnrichmentRepository;
  readonly metrics: EnrichmentMetricsRecorder;
}

@Injectable()
export class EnrichBriefUseCase {
  constructor(
    @Inject(EnrichBriefUseCase.DEPS_TOKEN)
    private readonly deps: EnrichBriefDeps,
  ) {}

  static readonly DEPS_TOKEN = Symbol.for('EnrichBriefDeps');

  async execute(input: EnrichBriefInput): Promise<EnrichBriefResult> {
    // Idempotence (SC-005) : un enrichissement existant est réutilisé, 0 appel LLM.
    if (await this.deps.repo.findByBriefId(input.briefId)) return { kind: 'reused' };

    const brief = await this.deps.briefReader.findById(input.briefId);
    if (!brief || brief.status === 'anonymized') return { kind: 'brief_not_found' };

    const createdAt = this.deps.clock.now();
    const startMs = this.deps.clock.nowMs();
    const text = gatherFreeText(brief);
    const record =
      text.length === 0
        ? blankRecord(input.briefId, createdAt, 'non_enrichi', 'empty_input')
        : await this.enrich(input.briefId, createdAt, text);

    this.deps.metrics.record({
      status: record.status,
      failureReason: record.failureReason,
      latencyMs: this.deps.clock.nowMs() - startMs,
      inputTokens: record.inputTokens ?? 0,
      outputTokens: record.outputTokens ?? 0,
    });
    await this.deps.repo.save(record);
    return { kind: 'enriched', status: record.status };
  }

  /** LLM best-effort + validation + classification. Ne throw jamais. */
  private async enrich(
    briefId: VoyageurBriefId,
    createdAt: Date,
    text: string,
  ): Promise<BriefEnrichmentRecord> {
    let llm: LlmResult;
    try {
      llm = await this.deps.llm.extractStructured({
        text,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeoutMs: TIMEOUT_MS,
      });
    } catch {
      llm = { kind: 'unavailable', reason: 'service' };
    }

    if (llm.kind === 'unavailable') {
      const reason: EnrichmentFailureReason = llm.reason === 'timeout' ? 'timeout' : 'unavailable';
      return blankRecord(briefId, createdAt, 'indisponible', reason);
    }

    const parsed = parseEnrichedIntentions(llm.raw);
    if (!parsed) {
      return {
        ...blankRecord(briefId, createdAt, 'indisponible', 'schema_invalid'),
        providerVersion: llm.providerVersion,
        inputTokens: llm.inputTokens,
        outputTokens: llm.outputTokens,
      };
    }

    const speciality: CanonicalSpeciality | null = parsed.speciality ?? null;
    const destinations = parsed.destinations ?? [];
    const { status, failureReason } = classify(
      speciality !== null || destinations.length > 0,
      parsed.confidence,
    );

    return {
      briefId,
      createdAt,
      status,
      enrichedSpeciality: speciality,
      enrichedDestinations: destinations,
      confidence: parsed.confidence,
      failureReason,
      providerVersion: llm.providerVersion,
      inputTokens: llm.inputTokens,
      outputTokens: llm.outputTokens,
    };
  }
}

/** Texte libre non identifiant, expurgé de PII (FR-004/FR-017). */
function gatherFreeText(brief: VoyageurBriefRecord): string {
  const fragments = [
    brief.budgetNote,
    brief.specialityOther,
    ...brief.destinations.map((d) => d.region ?? null),
  ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  return scrubContactPii(fragments.join('\n')).trim().slice(0, MAX_INPUT_CHARS);
}

/** Détermine le statut quand la sortie est valide. Pur. */
function classify(
  hasIntentions: boolean,
  confidence: number,
): { status: EnrichmentStatus; failureReason: EnrichmentFailureReason | null } {
  if (!hasIntentions) return { status: 'non_enrichi', failureReason: null };
  if (confidence < ENRICHMENT_CONFIDENCE_THRESHOLD) {
    return { status: 'partiel', failureReason: 'low_confidence' };
  }
  return { status: 'enrichi', failureReason: null };
}

/** Enregistrement sans intention (repli / échec). */
function blankRecord(
  briefId: VoyageurBriefId,
  createdAt: Date,
  status: EnrichmentStatus,
  failureReason: EnrichmentFailureReason | null,
): BriefEnrichmentRecord {
  return {
    briefId,
    createdAt,
    status,
    enrichedSpeciality: null,
    enrichedDestinations: [],
    confidence: 0,
    failureReason,
    providerVersion: null,
    inputTokens: null,
    outputTokens: null,
  };
}
