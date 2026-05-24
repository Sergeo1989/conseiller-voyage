// Middleware Next.js — routing localisé avec URL courte.
// L'utilisateur a demandé `/fr` au lieu de `/fr-CA` dans l'URL.
// La locale interne reste `fr-CA` pour préserver les formats régionaux
// QC (date-fns fr-CA, Intl.NumberFormat fr-CA, etc.) — c'est le mapping
// `localePrefix.prefixes` qui fait la traduction URL ↔ locale interne.

import createMiddleware from 'next-intl/middleware';
import { defaultLocale, localeUrlPrefixes, locales } from './i18n';

export default createMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: {
    mode: 'always',
    prefixes: localeUrlPrefixes,
  },
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
