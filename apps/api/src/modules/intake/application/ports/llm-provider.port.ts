// T004 [016] — Port LlmProvider (1re introduction LLM, derrière interface).
//
// Interface PURE (zéro SDK). Adaptateur concret = Bedrock ca-central-1 (ADR-0028,
// T031). La sortie `raw` est NON FIABLE : l'appelant (EnrichBriefUseCase) la valide
// via `parseEnrichedIntentions` avant tout usage (FR-006). L'adaptateur NE THROW
// JAMAIS pour une panne/timeout → `{ kind: 'unavailable' }` (mode dégradé, Principe X).

export interface LlmExtractInput {
  /** Texte NON identifiant déjà expurgé de PII (FR-004/FR-017). */
  readonly text: string;
  /** Borne de coût (≤ 0,05 USD/req, Principe V). */
  readonly maxOutputTokens: number;
  /** Budget strict ; au-delà → `unavailable` (`timeout`). */
  readonly timeoutMs: number;
}

export type LlmResult =
  | {
      readonly kind: 'ok';
      readonly raw: unknown; // non fiable — à valider Zod côté appelant
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly providerVersion: string;
    }
  | { readonly kind: 'unavailable'; readonly reason: 'timeout' | 'service' };

export interface LlmProvider {
  /** Extrait des intentions structurées. Ne throw jamais (panne → `unavailable`). */
  extractStructured(input: LlmExtractInput): Promise<LlmResult>;
}

export const LLM_PROVIDER = Symbol.for('LlmProvider');
