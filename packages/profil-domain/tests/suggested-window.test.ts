// T020 — Tests TDD RED pour fenetreValiditeSuggested (Principe VI, FR-008a).
//
// Couvre les bordures de la fenêtre 24 h + drift d'horloge négatif.

import { describe, expect, it } from 'vitest';
import { fenetreValiditeSuggested } from '../src/suggested-window';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe('fenetreValiditeSuggested (fonction pure)', () => {
  const now = new Date('2026-05-27T12:00:00Z').getTime();

  it('retourne true à 23h59min', () => {
    expect(fenetreValiditeSuggested(now - 23 * HOUR_MS - 59 * 60 * 1000, now)).toBe(true);
  });

  it('retourne true exactement à la bordure 24h (strictement < pas inclusive)', () => {
    // Convention : < 24h → valide, >= 24h → expiré.
    // À 23h59min59s ok, à 24h ko.
    expect(fenetreValiditeSuggested(now - DAY_MS + 1, now)).toBe(true);
  });

  it('retourne false à 24h pile', () => {
    expect(fenetreValiditeSuggested(now - DAY_MS, now)).toBe(false);
  });

  it('retourne false à 24h01min', () => {
    expect(fenetreValiditeSuggested(now - DAY_MS - 60 * 1000, now)).toBe(false);
  });

  it('retourne true pour timestamp très récent (1s ago)', () => {
    expect(fenetreValiditeSuggested(now - 1000, now)).toBe(true);
  });

  it('retourne false pour drift horloge négatif (timestamp dans le futur)', () => {
    // Sécurité : un timestamp futur est suspect (cookie tampered).
    expect(fenetreValiditeSuggested(now + 1000, now)).toBe(false);
  });

  it('retourne false pour drift horloge négatif > 24h', () => {
    expect(fenetreValiditeSuggested(now + DAY_MS, now)).toBe(false);
  });
});
