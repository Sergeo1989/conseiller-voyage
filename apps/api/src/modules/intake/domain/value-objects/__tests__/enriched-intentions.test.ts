// T009 [016 US1] [TDD RED] — Tests parseEnrichedIntentions (FR-006, SC-009).
// La sortie LLM est non fiable : seules les structures conformes au schéma
// passent ; tout le reste → null (repli). Cf. spec.md FR-006.

import { describe, expect, it } from 'vitest';
import { parseEnrichedIntentions } from '../enriched-intentions';

describe('parseEnrichedIntentions — sorties valides', () => {
  it('accepte spécialité canonique + destinations + confidence', () => {
    const out = parseEnrichedIntentions({
      speciality: 'lune_de_miel',
      destinations: ['Italie', 'Grèce'],
      confidence: 0.82,
    });
    expect(out).not.toBeNull();
    expect(out?.speciality).toBe('lune_de_miel');
  });

  it('accepte une sortie minimale (confidence seule)', () => {
    expect(parseEnrichedIntentions({ confidence: 0.4 })).toEqual({ confidence: 0.4 });
  });
});

describe('parseEnrichedIntentions — sorties rejetées (→ null)', () => {
  it('rejette une sortie sans confidence', () => {
    expect(parseEnrichedIntentions({ speciality: 'luxe' })).toBeNull();
  });

  it("rejette la spécialité non canonique 'autre'", () => {
    expect(parseEnrichedIntentions({ speciality: 'autre', confidence: 0.9 })).toBeNull();
  });

  it('rejette une clé inattendue (strict — anti-injection/PII)', () => {
    expect(parseEnrichedIntentions({ confidence: 0.9, email: 'a@b.ca' })).toBeNull();
  });

  it('rejette une destination ressemblant à une PII/montant', () => {
    expect(parseEnrichedIntentions({ destinations: ['a@b.ca'], confidence: 0.9 })).toBeNull();
    expect(parseEnrichedIntentions({ destinations: ['5000$'], confidence: 0.9 })).toBeNull();
  });

  it('rejette confidence hors [0,1]', () => {
    expect(parseEnrichedIntentions({ confidence: 1.5 })).toBeNull();
  });

  it('rejette une entrée non-objet', () => {
    expect(parseEnrichedIntentions(null)).toBeNull();
    expect(parseEnrichedIntentions('nope')).toBeNull();
  });
});
