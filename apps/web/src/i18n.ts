// T030d — Configuration next-intl complète + application de la map d'erreurs
// Zod FR-CA (T030f).

import { applyFrCAZodErrorMap } from '@cv/shared/conformite';
import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

export const locales = ['fr-CA', 'en'] as const;
export const defaultLocale = 'fr-CA' as const;
export type Locale = (typeof locales)[number];

/**
 * Mapping locale interne → segment URL court (Demande utilisateur
 * "URLs propres" : on garde fr-CA en interne pour les formats date-fns,
 * Intl.NumberFormat, emails, etc. — mais l'URL n'affiche que `/fr` ou `/en`.
 * Cf. next-intl localePrefix.prefixes dans middleware.ts.
 */
export const localeUrlPrefixes: Record<Locale, string> = {
  'fr-CA': '/fr',
  en: '/en',
};

/** Convertit la locale interne en segment d'URL (sans le slash final). */
export function toUrlLocale(locale: string): string {
  if (locale === 'fr-CA') return 'fr';
  if (locale === 'en') return 'en';
  return 'fr'; // fallback safe : redirige vers la locale par défaut
}

// Application de la map d'erreurs Zod FR-CA — exécutée une seule fois au boot.
applyFrCAZodErrorMap();

export default getRequestConfig(async ({ requestLocale }) => {
  // Next.js 15 + next-intl 3.22+ : requestLocale est une Promise asynchrone
  // (l'API headers() interne est devenue async). Cf.
  // https://next-intl.dev/blog/next-intl-3-22#await-request-locale
  const requested = await requestLocale;
  const resolvedLocale = (locales as readonly string[]).includes(requested ?? '')
    ? (requested as Locale)
    : defaultLocale;

  const messages = (
    (await import(`./i18n/messages/${resolvedLocale}.json`)) as { default: AbstractIntlMessages }
  ).default;

  return {
    locale: resolvedLocale,
    messages,
  };
});
