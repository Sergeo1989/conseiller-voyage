// T018 [TDD RED] — Tests du value object LeadState (domaine feature 012).
// Guards `isTerminal`, parsing strict d'un littéral en LeadState.
// Valeurs ASCII snake_case (cf. ADR-0025). Terminaux : refuse,
// reservation_confirmee, perdu.

import { describe, expect, it } from 'vitest';
import { InvalidLeadStateError, isTerminal, parseLeadState } from '../lead-state.vo';

describe('LeadState VO', () => {
  it('parseLeadState accepte les 7 états valides', () => {
    for (const s of [
      'envoye',
      'vu',
      'accepte',
      'refuse',
      'devis_envoye',
      'reservation_confirmee',
      'perdu',
    ]) {
      expect(parseLeadState(s)).toBe(s);
    }
  });

  it('parseLeadState rejette un littéral inconnu', () => {
    expect(() => parseLeadState('envoyé')).toThrow(InvalidLeadStateError);
    expect(() => parseLeadState('done')).toThrow(InvalidLeadStateError);
    expect(() => parseLeadState('')).toThrow(InvalidLeadStateError);
  });

  it('isTerminal vrai pour refuse / reservation_confirmee / perdu', () => {
    expect(isTerminal('refuse')).toBe(true);
    expect(isTerminal('reservation_confirmee')).toBe(true);
    expect(isTerminal('perdu')).toBe(true);
  });

  it('isTerminal faux pour envoye / vu / accepte / devis_envoye', () => {
    expect(isTerminal('envoye')).toBe(false);
    expect(isTerminal('vu')).toBe(false);
    expect(isTerminal('accepte')).toBe(false);
    expect(isTerminal('devis_envoye')).toBe(false);
  });
});
