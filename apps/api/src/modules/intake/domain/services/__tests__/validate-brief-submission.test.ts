// T042 [TDD RED] — Tests validateBriefSubmission (règles métier pures).
// Au-delà du Zod schema (qui valide la structure), ce service vérifie
// des invariants métier dépendant du "now" : voyage pas dans le passé,
// < 3 ans dans le futur, date retour > départ (déjà superRefiné côté
// Zod mais redondance défense en profondeur).
// Cf. spec.md Edge Cases.

import { describe, expect, it } from 'vitest';
import { validateBriefSubmission } from '../validate-brief-submission';

const NOW = new Date('2026-05-01T10:00:00Z');

const VALID_INPUT = {
  departureDate: new Date('2027-03-15'),
  returnDate: new Date('2027-03-30'),
  destinations: [{ country: 'IT' }],
  adultsCount: 2,
  childrenAges: [],
  infantsCount: 0,
};

describe('validateBriefSubmission — cas valides', () => {
  it('accepte un brief standard', () => {
    expect(() => validateBriefSubmission({ ...VALID_INPUT, now: NOW })).not.toThrow();
  });

  it('accepte un voyage dans 35 mois (< 3 ans)', () => {
    expect(() =>
      validateBriefSubmission({
        ...VALID_INPUT,
        departureDate: new Date('2029-03-15'),
        returnDate: new Date('2029-03-30'),
        now: NOW,
      }),
    ).not.toThrow();
  });

  it('accepte un voyage demain (< 24h)', () => {
    expect(() =>
      validateBriefSubmission({
        ...VALID_INPUT,
        departureDate: new Date('2026-05-02T00:00:00Z'),
        returnDate: new Date('2026-05-15T00:00:00Z'),
        now: NOW,
      }),
    ).not.toThrow();
  });
});

describe('validateBriefSubmission — cas refus', () => {
  it('refuse une date de départ dans le passé', () => {
    expect(() =>
      validateBriefSubmission({
        ...VALID_INPUT,
        departureDate: new Date('2026-04-01'),
        returnDate: new Date('2026-04-15'),
        now: NOW,
      }),
    ).toThrow(/passé|past/i);
  });

  it('refuse une date de retour avant la date de départ', () => {
    expect(() =>
      validateBriefSubmission({
        ...VALID_INPUT,
        departureDate: new Date('2027-03-30'),
        returnDate: new Date('2027-03-15'),
        now: NOW,
      }),
    ).toThrow();
  });

  it('refuse une date de retour égale à la date de départ', () => {
    expect(() =>
      validateBriefSubmission({
        ...VALID_INPUT,
        departureDate: new Date('2027-03-15'),
        returnDate: new Date('2027-03-15'),
        now: NOW,
      }),
    ).toThrow();
  });

  it('refuse un voyage > 3 ans dans le futur', () => {
    expect(() =>
      validateBriefSubmission({
        ...VALID_INPUT,
        departureDate: new Date('2030-01-01'),
        returnDate: new Date('2030-01-15'),
        now: NOW,
      }),
    ).toThrow(/3 ans|too far/i);
  });

  it('refuse destinations vide', () => {
    expect(() =>
      validateBriefSubmission({
        ...VALID_INPUT,
        destinations: [],
        now: NOW,
      }),
    ).toThrow();
  });

  it('refuse adultsCount = 0', () => {
    expect(() =>
      validateBriefSubmission({
        ...VALID_INPUT,
        adultsCount: 0,
        now: NOW,
      }),
    ).toThrow();
  });
});
