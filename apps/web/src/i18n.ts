// Configuration next-intl — squelette créé en T009.
// La configuration complète (chargement dynamique des catalogues, fallback, etc.)
// sera mise en place en T030d (next-intl provider + middleware Next.js).
import { getRequestConfig } from 'next-intl/server';

export const locales = ['fr-CA', 'en'] as const;
export const defaultLocale = 'fr-CA' as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ locale }) => {
  const resolvedLocale = (locales as readonly string[]).includes(locale ?? '')
    ? (locale as Locale)
    : defaultLocale;

  return {
    locale: resolvedLocale,
    messages: {},
  };
});
