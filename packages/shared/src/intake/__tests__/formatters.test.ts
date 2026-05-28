// Tests T022 — formatters i18n FR-CA + EN du module intake.
// Couverture 100 % visée (fonctions pures, déterministes).

import { describe, expect, it } from 'vitest';
import {
  formatBudgetRange,
  formatConseillerLanguage,
  formatFamiliarity,
  formatSpeciality,
} from '../formatters';

describe('formatBudgetRange', () => {
  it('formate les 5 valeurs canoniques en FR-CA', () => {
    expect(formatBudgetRange('under_2k')).toContain('Moins');
    expect(formatBudgetRange('between_2k_5k')).toContain('2 000');
    expect(formatBudgetRange('between_5k_10k')).toContain('5 000');
    expect(formatBudgetRange('between_10k_20k')).toContain('10 000');
    expect(formatBudgetRange('above_20k')).toContain('Plus de');
  });

  it('formate en EN si locale=en', () => {
    expect(formatBudgetRange('under_2k', 'en')).toContain('Under');
    expect(formatBudgetRange('above_20k', 'en')).toContain('Above');
  });

  it('utilise FR-CA par défaut', () => {
    expect(formatBudgetRange('under_2k')).toBe(formatBudgetRange('under_2k', 'fr-CA'));
  });

  it('locale commençant par "fr-" → FR-CA', () => {
    expect(formatBudgetRange('under_2k', 'fr-FR')).toBe(formatBudgetRange('under_2k', 'fr-CA'));
  });

  it('locale inconnue → fallback EN', () => {
    expect(formatBudgetRange('under_2k', 'de-DE')).toContain('Under');
  });
});

describe('formatSpeciality', () => {
  it('formate les 11 valeurs canoniques en FR-CA', () => {
    expect(formatSpeciality('croisiere')).toBe('Croisière');
    expect(formatSpeciality('aventure_outdoor')).toBe('Aventure / Outdoor');
    expect(formatSpeciality('lune_de_miel')).toBe('Lune de miel');
    expect(formatSpeciality('famille_avec_enfants')).toBe('Famille avec enfants');
    expect(formatSpeciality('mobilite_reduite')).toBe('Adapté mobilité réduite');
    expect(formatSpeciality('multigenerationnel')).toBe('Multigénérationnel');
    expect(formatSpeciality('culturel_historique')).toBe('Culturel / Historique');
    expect(formatSpeciality('luxe')).toBe('Luxe');
    expect(formatSpeciality('road_trip')).toBe('Road trip');
    expect(formatSpeciality('voyage_affaires')).toBe('Voyage d’affaires');
    expect(formatSpeciality('autre')).toBe('Autre');
  });

  it('formate "lune_de_miel" en EN', () => {
    expect(formatSpeciality('lune_de_miel', 'en')).toBe('Honeymoon');
  });

  it('formate "autre" en EN', () => {
    expect(formatSpeciality('autre', 'en')).toBe('Other');
  });
});

describe('formatFamiliarity', () => {
  it('formate les 3 valeurs en FR-CA', () => {
    expect(formatFamiliarity('first_big_trip')).toContain('Premier');
    expect(formatFamiliarity('occasional_traveler')).toContain('occasionnel');
    expect(formatFamiliarity('experienced_traveler')).toContain('expérimenté');
  });

  it('formate les 3 valeurs en EN', () => {
    expect(formatFamiliarity('first_big_trip', 'en')).toContain('First');
    expect(formatFamiliarity('occasional_traveler', 'en')).toContain('Occasional');
    expect(formatFamiliarity('experienced_traveler', 'en')).toContain('Experienced');
  });
});

describe('formatConseillerLanguage', () => {
  it('formate fr/en/es en FR-CA', () => {
    expect(formatConseillerLanguage('fr')).toBe('Français');
    expect(formatConseillerLanguage('en')).toBe('Anglais');
    expect(formatConseillerLanguage('es')).toBe('Espagnol');
  });

  it('formate fr/en/es en EN', () => {
    expect(formatConseillerLanguage('fr', { locale: 'en' })).toBe('French');
    expect(formatConseillerLanguage('en', { locale: 'en' })).toBe('English');
    expect(formatConseillerLanguage('es', { locale: 'en' })).toBe('Spanish');
  });

  it('formate other sans code → "Autre" / "Other"', () => {
    expect(formatConseillerLanguage('other')).toBe('Autre');
    expect(formatConseillerLanguage('other', { locale: 'en' })).toBe('Other');
  });

  it('formate other avec code ISO 639-1 (R8)', () => {
    expect(formatConseillerLanguage('other', { otherIsoCode: 'pt' })).toBe('Autre (PT)');
    expect(formatConseillerLanguage('other', { locale: 'en', otherIsoCode: 'it' })).toBe(
      'Other (IT)',
    );
  });

  it('ignore otherIsoCode si language n est pas other', () => {
    expect(formatConseillerLanguage('fr', { otherIsoCode: 'pt' })).toBe('Français');
  });
});
