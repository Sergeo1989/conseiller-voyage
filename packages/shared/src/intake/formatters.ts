// T022 — Formatters i18n FR-CA + EN du module intake.
//
// Sources de vérité (vs catalogue i18n des UI) :
//   - Labels canoniques des 5 budgets, 11 spécialités, 3 familiarités
//   - Utilisés par BriefRecap (US2), EmailSentNotice, magic-link.tsx,
//     les CLIs scan-intake-* (Phase 8), et tout futur consommateur
//
// Toutes les fonctions sont **pures** (zéro effet de bord). Couverture
// cible : 100 % (testée dans __tests__/formatters.test.ts).
//
// Locale conventions : la chaîne d'entrée commence par 'fr' → FR-CA,
// sinon EN (cohérent avec packages/shared/src/conformite/formatters.ts).

import type {
  ConseillerLanguage,
  TravelBudget,
  TravelFamiliarity,
  TravelSpeciality,
} from './schemas';

type SupportedLocale = 'fr-CA' | 'en';

function resolveLocale(locale: string): SupportedLocale {
  return locale.startsWith('fr') ? 'fr-CA' : 'en';
}

// =====================================================================
// formatBudgetRange (FR-005, 5 valeurs canoniques)
// =====================================================================

const BUDGET_LABELS: Record<TravelBudget, Record<SupportedLocale, string>> = {
  under_2k: { 'fr-CA': 'Moins de 2 000 $', en: 'Under $2,000' },
  between_2k_5k: { 'fr-CA': 'De 2 000 $ à 5 000 $', en: '$2,000 – $5,000' },
  between_5k_10k: { 'fr-CA': 'De 5 000 $ à 10 000 $', en: '$5,000 – $10,000' },
  between_10k_20k: { 'fr-CA': 'De 10 000 $ à 20 000 $', en: '$10,000 – $20,000' },
  above_20k: { 'fr-CA': 'Plus de 20 000 $', en: 'Above $20,000' },
};

export function formatBudgetRange(budget: TravelBudget, locale = 'fr-CA'): string {
  return BUDGET_LABELS[budget][resolveLocale(locale)];
}

// =====================================================================
// formatSpeciality (FR-007, 11 valeurs canoniques + "autre")
// =====================================================================

const SPECIALITY_LABELS: Record<TravelSpeciality, Record<SupportedLocale, string>> = {
  croisiere: { 'fr-CA': 'Croisière', en: 'Cruise' },
  aventure_outdoor: { 'fr-CA': 'Aventure / Outdoor', en: 'Adventure / Outdoor' },
  lune_de_miel: { 'fr-CA': 'Lune de miel', en: 'Honeymoon' },
  famille_avec_enfants: { 'fr-CA': 'Famille avec enfants', en: 'Family with children' },
  mobilite_reduite: { 'fr-CA': 'Adapté mobilité réduite', en: 'Accessible / Reduced mobility' },
  multigenerationnel: { 'fr-CA': 'Multigénérationnel', en: 'Multigenerational' },
  culturel_historique: { 'fr-CA': 'Culturel / Historique', en: 'Cultural / Historical' },
  luxe: { 'fr-CA': 'Luxe', en: 'Luxury' },
  road_trip: { 'fr-CA': 'Road trip', en: 'Road trip' },
  voyage_affaires: { 'fr-CA': 'Voyage d’affaires', en: 'Business travel' },
  autre: { 'fr-CA': 'Autre', en: 'Other' },
};

export function formatSpeciality(speciality: TravelSpeciality, locale = 'fr-CA'): string {
  return SPECIALITY_LABELS[speciality][resolveLocale(locale)];
}

// =====================================================================
// formatFamiliarity (FR-008, 3 valeurs canoniques)
// =====================================================================

const FAMILIARITY_LABELS: Record<TravelFamiliarity, Record<SupportedLocale, string>> = {
  first_big_trip: {
    'fr-CA': 'Premier grand voyage international',
    en: 'First major international trip',
  },
  occasional_traveler: {
    'fr-CA': 'Voyageur occasionnel (1-3 voyages internationaux)',
    en: 'Occasional traveler (1–3 international trips)',
  },
  experienced_traveler: {
    'fr-CA': 'Voyageur expérimenté (4+ voyages internationaux)',
    en: 'Experienced traveler (4+ international trips)',
  },
};

export function formatFamiliarity(familiarity: TravelFamiliarity, locale = 'fr-CA'): string {
  return FAMILIARITY_LABELS[familiarity][resolveLocale(locale)];
}

// =====================================================================
// formatConseillerLanguage (FR-006, 4 valeurs canoniques + ISO 639-1 fallback)
// =====================================================================

const LANGUAGE_LABELS: Record<ConseillerLanguage, Record<SupportedLocale, string>> = {
  fr: { 'fr-CA': 'Français', en: 'French' },
  en: { 'fr-CA': 'Anglais', en: 'English' },
  es: { 'fr-CA': 'Espagnol', en: 'Spanish' },
  other: { 'fr-CA': 'Autre', en: 'Other' },
};

export function formatConseillerLanguage(
  language: ConseillerLanguage,
  options: { locale?: string; otherIsoCode?: string | null } = {},
): string {
  const locale = options.locale ?? 'fr-CA';
  const label = LANGUAGE_LABELS[language][resolveLocale(locale)];
  if (language === 'other' && options.otherIsoCode) {
    return `${label} (${options.otherIsoCode.toUpperCase()})`;
  }
  return label;
}
