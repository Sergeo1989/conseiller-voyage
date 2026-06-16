// T008 [016 US1] [TDD RED] — Tests scrubContactPii (FR-017).
// Le texte libre du brief peut contenir une coordonnée tapée par le voyageur ;
// elle DOIT être expurgée avant l'envoi au LLM (Loi 25). Cf. spec.md FR-017.

import { describe, expect, it } from 'vitest';
import { scrubContactPii } from '../scrub-contact-pii';

describe('scrubContactPii — courriels', () => {
  it('expurge un courriel', () => {
    expect(scrubContactPii('écris à jean.dupont@example.com stp')).toBe('écris à [redacted] stp');
  });

  it('expurge plusieurs courriels', () => {
    expect(scrubContactPii('a@b.ca ou c.d@e.io')).toBe('[redacted] ou [redacted]');
  });
});

describe('scrubContactPii — téléphones', () => {
  it('expurge un numéro NA avec tirets', () => {
    expect(scrubContactPii('appelle 514-555-1234')).toBe('appelle [redacted]');
  });

  it('expurge un numéro avec parenthèses et +1', () => {
    expect(scrubContactPii('+1 (438) 555 0000 le soir')).toBe('[redacted] le soir');
  });
});

describe('scrubContactPii — texte propre / faux positifs', () => {
  it('laisse intact un texte sans PII', () => {
    const t = 'Lune de miel en Italie, budget flexible, 2 semaines en mai.';
    expect(scrubContactPii(t)).toBe(t);
  });

  it('ne traite pas un UUID comme un téléphone', () => {
    const t = 'ref 550e8400-e29b-41d4-a716-446655440000';
    expect(scrubContactPii(t)).toBe(t);
  });

  it('est idempotent', () => {
    const once = scrubContactPii('mail a@b.ca');
    expect(scrubContactPii(once)).toBe(once);
  });
});
