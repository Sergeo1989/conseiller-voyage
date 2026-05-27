// Middleware Next.js — routing localisé + check version CGU B2B (T076).
//
// 1. Délégation à next-intl pour le routing localisé (FR-CA prefix /fr,
//    EN prefix /en). La locale interne reste `fr-CA`.
// 2. Check version CGU B2B (US3 P2) : sur les routes `/(conseiller)/**`
//    (auth requise), vérifie que le user a accepté la version courante.
//
//    - Cookie HMAC `__Host-cv.legal-version` présent et valide ET
//      cguB2bVersion === currentVersion → laisser passer.
//    - Sinon → redirect vers `/cgu-conseiller/re-accepter` (sauf si
//      l'URL EST DÉJÀ `/cgu-conseiller/re-accepter` ou `/api/*` pour
//      éviter une boucle).
//
//    Le cas P0 «forge detection» (signature invalide) est traité par
//    `verifyLegalVersionCookie` qui retourne `null` — on tombe sur le
//    chemin de redirect comme un cookie absent (pas de log d'alerte
//    explicite ici — laissé au monitoring via `legal_cookie_forge_detected_total`).
//
// Cf. specs/004-mentions-legales/contracts/middleware-version-check.md
// + ADR-0009.

import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { defaultLocale, localeUrlPrefixes, locales } from './i18n';
import {
  LEGAL_VERSION_COOKIE_NAME,
  fetchCurrentCguB2bVersion,
  readLegalVersionCookie,
} from './lib/legal/version-check';

const intlMiddleware = createMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: { mode: 'always', prefixes: localeUrlPrefixes },
});

const CONSEILLER_PROTECTED_PATTERN = /\/(?:fr|en)\/(?:conseiller)(?:\/|$)/;
const REACCEPTANCE_PATH_PATTERN = /\/(?:fr|en)\/cgu-conseiller\/re-accepter(?:\/|$)?/;

function shouldCheckLegalVersion(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return false;
  if (REACCEPTANCE_PATH_PATTERN.test(pathname)) return false;
  return CONSEILLER_PROTECTED_PATTERN.test(pathname);
}

function buildReacceptanceRedirect(req: NextRequest): NextResponse {
  // Préserve la locale URL (/fr ou /en) pour ne pas casser le routing.
  const localeMatch = req.nextUrl.pathname.match(/^\/(fr|en)\//);
  const localePrefix = localeMatch ? `/${localeMatch[1]}` : '/fr';
  const url = req.nextUrl.clone();
  url.pathname = `${localePrefix}/cgu-conseiller/re-accepter`;
  url.search = '';
  return NextResponse.redirect(url);
}

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  const intlResponse = intlMiddleware(req);
  const { pathname } = req.nextUrl;

  if (!shouldCheckLegalVersion(pathname)) {
    return intlResponse;
  }

  const hmacSecret = process.env.LEGAL_COOKIE_HMAC_SECRET;
  if (!hmacSecret || hmacSecret.length === 0) {
    // Pas de secret configuré (dev local, pre-T005) — fallback safe :
    // ne bloque pas le routing. Le check fera son travail dès que les
    // secrets sont en place.
    return intlResponse;
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  if (apiBaseUrl.length === 0) {
    return intlResponse;
  }

  const cookieRaw = req.cookies.get(LEGAL_VERSION_COOKIE_NAME)?.value;
  const nowMs = Date.now();
  const payload = await readLegalVersionCookie(cookieRaw, hmacSecret, nowMs);

  const currentVersion = await fetchCurrentCguB2bVersion(apiBaseUrl);
  if (currentVersion === null) {
    // API indisponible — fallback safe : laisser passer (le check sera
    // re-tenté à la prochaine requête).
    return intlResponse;
  }

  if (payload && payload.cguB2bVersion === currentVersion) {
    return intlResponse;
  }

  // Cookie absent / invalide / version obsolète → redirect re-acceptation.
  return buildReacceptanceRedirect(req);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
