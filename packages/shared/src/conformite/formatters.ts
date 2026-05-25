// T030g — Helpers de formatage régionaux FR-CA (Principe IV).
// Wrappers de date-fns + Intl.NumberFormat avec locale par défaut `fr-CA`.
// Toute UI / template email DOIT passer par ces helpers — aucun format
// hardcodé dans les composants (`'dd MMMM yyyy'` etc.).

import { format } from 'date-fns';
import { enUS, frCA } from 'date-fns/locale';

const LOCALES = { 'fr-CA': frCA, en: enUS } as const;
type SupportedLocale = keyof typeof LOCALES;

function resolveLocale(locale: string): SupportedLocale {
  if (locale.startsWith('fr')) return 'fr-CA';
  return 'en';
}

/**
 * Date au format long localisé (ex: `15 juin 2026` en fr-CA, `June 15, 2026` en en).
 */
export function formatDate(date: Date, locale = 'fr-CA'): string {
  const resolved = resolveLocale(locale);
  if (resolved === 'fr-CA') {
    return format(date, 'd MMMM yyyy', { locale: LOCALES['fr-CA'] });
  }
  return format(date, 'MMMM d, yyyy', { locale: LOCALES.en });
}

/**
 * Date + heure 24h localisée (ex: `15 juin 2026 à 14:30` en fr-CA).
 */
export function formatDateTime(date: Date, locale = 'fr-CA'): string {
  const resolved = resolveLocale(locale);
  if (resolved === 'fr-CA') {
    return format(date, "d MMMM yyyy 'à' HH:mm", { locale: LOCALES['fr-CA'] });
  }
  return format(date, "MMMM d, yyyy 'at' HH:mm", { locale: LOCALES.en });
}

/**
 * Montant en devise localisée (ex: `1 234,56 $` en fr-CA, `$1,234.56` en en).
 */
export function formatCurrency(amount: number, currency = 'CAD', locale = 'fr-CA'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}
