// T075 — Helper version-check pour le middleware Next.js.
//
// Lit le cookie HMAC `__Host-cv.legal-version` si présent. Sinon appelle
// GET /api/me/legal/version-status et met le cookie en place pour les
// prochaines requêtes (TTL 5 min — évite un round-trip par requête).
//
// Pure côté logique cookie. Le fetch HTTP est wrapé via cache process 60 s
// pour les cas où la version courante change (signal de bump).
//
// Cf. contracts/middleware-version-check.md + ADR-0009.

import {
  type LegalVersionCookiePayload,
  signLegalVersionCookie,
  verifyLegalVersionCookie,
} from '@cv/legal';

export const LEGAL_VERSION_COOKIE_NAME = '__Host-cv.legal-version';
export const LEGAL_VERSION_COOKIE_TTL_SECONDS = 300; // 5 minutes

export type LegalVersionStatus = 'up_to_date' | 'outdated' | 'never_accepted';

export interface LegalVersionStatusResult {
  readonly status: LegalVersionStatus;
  readonly currentVersion: number;
  readonly acceptedVersion: number | null;
}

interface CurrentVersionCacheEntry {
  readonly value: number;
  readonly fetchedAtMs: number;
}

const CURRENT_VERSION_CACHE_TTL_MS = 60_000; // 60 s — réplique le cache documenté contrats
let currentVersionCache: CurrentVersionCacheEntry | null = null;

/**
 * Récupère la version courante de cgu_b2b. Cache process 60 s pour ne pas
 * marteler l'API avec un appel par requête middleware. Retourne `null` si
 * l'API est indisponible (le middleware traitera comme un fallback safe).
 */
export async function fetchCurrentCguB2bVersion(apiBaseUrl: string): Promise<number | null> {
  const now = Date.now();
  if (currentVersionCache && now - currentVersionCache.fetchedAtMs < CURRENT_VERSION_CACHE_TTL_MS) {
    return currentVersionCache.value;
  }
  try {
    const res = await fetch(`${apiBaseUrl}/api/legal/cgu-b2b/current-version`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      // Edge runtime : pas de body, GET pur, pas de credentials
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { version?: number };
    if (typeof json.version !== 'number' || json.version <= 0) return null;
    currentVersionCache = { value: json.version, fetchedAtMs: now };
    return json.version;
  } catch {
    return null;
  }
}

/**
 * Lit le cookie HMAC s'il est présent et valide. Retourne le payload
 * décodé si la signature passe et que `exp > nowMs`. Retourne `null`
 * pour tout autre cas (cookie absent, signature invalide → forge,
 * cookie expiré, payload malformé).
 *
 * Async parce que la vérification HMAC utilise la Web Crypto API
 * (compatible Edge runtime de Next.js).
 */
export async function readLegalVersionCookie(
  rawCookie: string | undefined,
  secret: string,
  nowMs: number,
): Promise<LegalVersionCookiePayload | null> {
  return verifyLegalVersionCookie(rawCookie, secret, nowMs);
}

/**
 * Génère un nouveau cookie HMAC pour la session courante.
 * Le caller (controller ou middleware) doit faire `Set-Cookie` avec :
 *   - Name=__Host-cv.legal-version
 *   - HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age=300
 */
export async function buildLegalVersionCookie(
  userId: string,
  cguB2bVersion: number,
  secret: string,
): Promise<string> {
  return signLegalVersionCookie(userId, cguB2bVersion, secret, LEGAL_VERSION_COOKIE_TTL_SECONDS);
}

/**
 * Helper exporté pour les tests — réinitialise le cache de version
 * courante (uniquement utilisé par Vitest pour isoler les cas).
 */
export function __resetCurrentVersionCacheForTests(): void {
  currentVersionCache = null;
}
