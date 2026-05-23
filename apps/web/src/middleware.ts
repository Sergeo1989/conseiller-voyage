// Middleware Next.js — squelette routing localisé créé en T009.
// Configuration complète (détection cookie + Accept-Language, redirections)
// sera finalisée en T030d.
import createMiddleware from 'next-intl/middleware';
import { defaultLocale, locales } from './i18n';

export default createMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'always',
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
