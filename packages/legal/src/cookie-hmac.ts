// Fonctions pures de signature et vérification du cookie HMAC
// `__Host-cv.legal-version` (cf. ADR-0009).
//
// **Note d'architecture** : le plan 004 plaçait ces helpers dans
// `apps/web/src/lib/legal/`. La pureté de ces fonctions (zéro
// dépendance Next.js, zéro side effect) justifie leur co-localisation
// dans `packages/legal/` pour faciliter le test TDD et permettre la
// réutilisation si NestJS doit un jour vérifier un cookie côté backend.
// Le plan sera mis à jour pour refléter ce choix.
//
// TDD validé (Principe VI) — tests dans __tests__/cookie-hmac.test.ts.

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Payload du cookie HMAC signé `__Host-cv.legal-version`.
 *
 * Format : `base64url(JSON.stringify(payload)) + '.' + hex(HMAC-SHA256(...))`
 */
export interface LegalVersionCookiePayload {
  /** UUID v4 de l'utilisateur authentifié */
  readonly userId: string;
  /** Version cgu_b2b acceptée (entier positif strict) */
  readonly cguB2bVersion: number;
  /** Expiration UTC en millisecondes Unix */
  readonly exp: number;
}

function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(input: string): string | null {
  // Restaurer le padding
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4;
  const padStr = padding === 0 ? padded : padded + '='.repeat(4 - padding);
  try {
    return Buffer.from(padStr, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

function sign(payloadEncoded: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadEncoded).digest('hex');
}

/**
 * Signe un payload en cookie HMAC-SHA256 avec un secret.
 *
 * @param userId UUID v4 de l'utilisateur
 * @param cguB2bVersion version acceptée (entier > 0)
 * @param secret secret HMAC (≥ 1 char, 32 bytes recommandé en prod)
 * @param ttlSeconds durée de vie du cookie en secondes (défaut 300 = 5 min)
 * @returns chaîne `base64url-payload.hex-signature`
 * @throws si userId est vide, version ≤ 0, ou secret vide
 */
export function signLegalVersionCookie(
  userId: string,
  cguB2bVersion: number,
  secret: string,
  ttlSeconds = 300,
): string {
  if (userId.length === 0) {
    throw new Error('signLegalVersionCookie: userId must not be empty');
  }
  if (!Number.isInteger(cguB2bVersion) || cguB2bVersion <= 0) {
    throw new Error(
      `signLegalVersionCookie: cguB2bVersion must be a positive integer, got ${cguB2bVersion}`,
    );
  }
  if (secret.length === 0) {
    throw new Error('signLegalVersionCookie: secret must not be empty');
  }

  const payload: LegalVersionCookiePayload = {
    userId,
    cguB2bVersion,
    exp: Date.now() + ttlSeconds * 1000,
  };
  const encoded = base64urlEncode(JSON.stringify(payload));
  const signature = sign(encoded, secret);
  return `${encoded}.${signature}`;
}

/**
 * Vérifie un cookie HMAC signé et retourne le payload décodé si valide.
 *
 * Détecte :
 * - signature HMAC invalide (forge détectée → log d'alerte côté middleware)
 * - payload malformé (JSON parse échoue)
 * - cookie expiré (`exp < nowMs`)
 * - champs manquants ou typés
 *
 * Toutes les comparaisons de signature utilisent `timingSafeEqual` pour
 * empêcher les attaques par timing.
 *
 * @param rawCookie valeur du cookie depuis `req.cookies.get('__Host-cv.legal-version')`
 * @param secret secret HMAC pour vérifier la signature
 * @param nowMs timestamp Unix actuel en millisecondes (paramètre pour testabilité)
 * @returns payload décodé si valide, `null` sinon (jamais d'exception)
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 6 contrôles de sécurité distincts (forge, expiration, payload, champs typés) — chaque garde-fou est testé (16 tests) et critique pour ne pas accepter un cookie malformé
export function verifyLegalVersionCookie(
  rawCookie: string | undefined,
  secret: string,
  nowMs: number,
): LegalVersionCookiePayload | null {
  if (!rawCookie || rawCookie.length === 0) {
    return null;
  }
  if (secret.length === 0) {
    return null;
  }

  const parts = rawCookie.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const encodedPayload = parts[0];
  const presentedSig = parts[1];
  if (
    encodedPayload === undefined ||
    presentedSig === undefined ||
    encodedPayload.length === 0 ||
    presentedSig.length === 0
  ) {
    return null;
  }

  // Vérifier la signature HMAC en temps constant
  const expectedSig = sign(encodedPayload, secret);
  if (presentedSig.length !== expectedSig.length) {
    return null;
  }
  let sigMatches = false;
  try {
    sigMatches = timingSafeEqual(Buffer.from(presentedSig, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return null;
  }
  if (!sigMatches) {
    return null;
  }

  // Décoder le payload
  const decoded = base64urlDecode(encodedPayload);
  if (decoded === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.userId !== 'string' || obj.userId.length === 0) {
    return null;
  }
  if (
    typeof obj.cguB2bVersion !== 'number' ||
    !Number.isInteger(obj.cguB2bVersion) ||
    obj.cguB2bVersion <= 0
  ) {
    return null;
  }
  if (typeof obj.exp !== 'number' || !Number.isFinite(obj.exp)) {
    return null;
  }
  if (obj.exp < nowMs) {
    return null;
  }

  return {
    userId: obj.userId,
    cguB2bVersion: obj.cguB2bVersion,
    exp: obj.exp,
  };
}
