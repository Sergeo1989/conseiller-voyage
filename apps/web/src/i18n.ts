// T030d — Configuration next-intl complète + application de la map d'erreurs
// Zod FR-CA (T030f).

import { applyFrCAZodErrorMap } from '@cv/shared/conformite';
import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';

export const locales = ['fr-CA', 'en'] as const;
export const defaultLocale = 'fr-CA' as const;
export type Locale = (typeof locales)[number];

// Application de la map d'erreurs Zod FR-CA — exécutée une seule fois au boot.
applyFrCAZodErrorMap();

export default getRequestConfig(async ({ locale }) => {
  const resolvedLocale = (locales as readonly string[]).includes(locale ?? '')
    ? (locale as Locale)
    : defaultLocale;

  const messages = (
    (await import(`./i18n/messages/${resolvedLocale}.json`)) as { default: AbstractIntlMessages }
  ).default;

  return {
    locale: resolvedLocale,
    messages,
  };
});
