// T011 [016 US1] [TDD GREEN] — Scrub PII de contact du texte libre (FR-017).
//
// Un champ libre du brief (`budgetNote`, `specialityOther`, notes de région)
// peut contenir une coordonnée tapée par le voyageur. On l'expurge de façon
// DÉTERMINISTE AVANT tout envoi au `LlmProvider` (Loi 25 / minimisation).
// Fonction pure (zéro I/O). Patterns conservateurs alignés sur le scan anti-PII
// (`tools/check-no-pii-matching-audit.ts`).

const REDACTED = '[redacted]';

// Courriel.
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Téléphone NA avec séparateurs OBLIGATOIRES (un UUID ne matche pas).
const PHONE = /(?:\+?1[-.\s])?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g;

/** Remplace courriels et téléphones par `[redacted]`. Idempotent. */
export function scrubContactPii(text: string): string {
  return text.replace(EMAIL, REDACTED).replace(PHONE, REDACTED);
}
