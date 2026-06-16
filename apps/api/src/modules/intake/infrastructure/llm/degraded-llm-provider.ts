// T020 [016] — Provider LLM par défaut : toujours `unavailable` (mode dégradé).
//
// Placeholder PROD sûr tant que l'adaptateur Bedrock ca-central-1 (T031) n'est
// pas branché : l'enrichissement replie systématiquement sur le brief
// déterministe (Principe X) sans jamais bloquer l'intake ni le matching.

import { Injectable } from '@nestjs/common';
import type { LlmProvider, LlmResult } from '../../application/ports/llm-provider.port';

@Injectable()
export class DegradedLlmProvider implements LlmProvider {
  extractStructured(): Promise<LlmResult> {
    return Promise.resolve({ kind: 'unavailable', reason: 'service' });
  }
}
