// T012 [016 US1] [TDD GREEN] — VO EnrichedIntentions (frontière de confiance LLM).
//
// La sortie brute du `LlmProvider` est NON FIABLE : on la valide contre le
// schéma partagé `.strict()` (FR-006). Toute sortie malformée, hors schéma, ou
// contenant une clé inattendue → `null` (l'appelant replie en `indisponible`,
// `failureReason = schema_invalid`). Fonction pure.

import { type EnrichedIntentions, EnrichedIntentionsSchema } from '@cv/shared/intake';

/** Valide/sanitise la sortie LLM. Retourne `null` si non conforme (jamais throw). */
export function parseEnrichedIntentions(raw: unknown): EnrichedIntentions | null {
  const result = EnrichedIntentionsSchema.safeParse(raw);
  return result.success ? result.data : null;
}
