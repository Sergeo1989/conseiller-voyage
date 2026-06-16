// T006 [016] — Fake LlmProvider déterministe (tests/dev, aucun appel réseau).
//
// Comportement paramétrable + compteur d'appels + capture du dernier input
// (pour vérifier l'absence de PII dans le payload — FR-004/FR-017, T015).

import type {
  LlmExtractInput,
  LlmProvider,
  LlmResult,
} from '../../../application/ports/llm-provider.port';

export class FakeLlmProvider implements LlmProvider {
  callCount = 0;
  lastInput: LlmExtractInput | null = null;

  constructor(private readonly behavior: LlmResult) {}

  extractStructured(input: LlmExtractInput): Promise<LlmResult> {
    this.callCount += 1;
    this.lastInput = input;
    return Promise.resolve(this.behavior);
  }

  /** Raccourci : réponse `ok` avec un objet `raw` donné. */
  static ok(raw: unknown): FakeLlmProvider {
    return new FakeLlmProvider({
      kind: 'ok',
      raw,
      inputTokens: 10,
      outputTokens: 20,
      providerVersion: 'fake-v1',
    });
  }

  /** Raccourci : panne (mode dégradé). */
  static unavailable(reason: 'timeout' | 'service' = 'service'): FakeLlmProvider {
    return new FakeLlmProvider({ kind: 'unavailable', reason });
  }
}
