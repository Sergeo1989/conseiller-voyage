// Fonctions pures de signature et vérification du cookie HMAC
// `__Host-cv.legal-version` (cf. ADR-0009).
//
// **Note d'architecture** : ces fonctions doivent fonctionner à la fois
// côté Node (apps/api — controllers) et côté Edge (apps/web middleware).
// Pour rester compatible Edge runtime de Next.js, on utilise la Web
// Crypto API (`globalThis.crypto.subtle`) plutôt que `node:crypto`.
// Web Crypto étant disponible en Node 18+ aussi, c'est l'union des
// deux runtimes.
//
// L'API est asynchrone (Web Crypto retourne des Promises) — les
// appelants doivent `await`.
//
// TDD validé (Principe VI) — tests dans __tests__/cookie-hmac.test.ts.

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

const encoder = new TextEncoder();

function base64urlEncode(input: string): string {
  // btoa accepte ASCII — pour de l'UTF-8 il faut passer par Buffer-equivalent.
  // En Edge runtime, on utilise TextEncoder + uint8Array + btoa.
  const bytes = encoder.encode(input);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input: string): string | null {
  try {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = padded.length % 4;
    const padStr = padding === 0 ? padded : padded + '='.repeat(4 - padding);
    const binary = atob(padStr);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}

function toHex(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let out = '';
  for (const b of arr) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = Number.parseInt(hex.substr(i, 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i / 2] = byte;
  }
  return out;
}

async function sign(payloadEncoded: string, secret: string): Promise<string> {
  // globalThis.crypto.subtle existe en Node 18+ (Web Crypto API) et en
  // Edge runtime Next.js. Le type CryptoKey est dans lib DOM — laissé
  // implicite pour ne pas exiger l'inclusion DOM dans tous les
  // consommateurs.
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const sigBuffer = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payloadEncoded),
  );
  return toHex(sigBuffer);
}

/**
 * Comparaison de signatures en temps constant. Implémentée manuellement
 * pour fonctionner en Edge runtime (pas de `crypto.timingSafeEqual`
 * Node-only).
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
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
export async function signLegalVersionCookie(
  userId: string,
  cguB2bVersion: number,
  secret: string,
  ttlSeconds = 300,
): Promise<string> {
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
  const signature = await sign(encoded, secret);
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
 * Toutes les comparaisons de signature utilisent une comparaison en
 * temps constant pour empêcher les attaques par timing.
 *
 * @param rawCookie valeur du cookie depuis `req.cookies.get('__Host-cv.legal-version')`
 * @param secret secret HMAC pour vérifier la signature
 * @param nowMs timestamp Unix actuel en millisecondes (paramètre pour testabilité)
 * @returns payload décodé si valide, `null` sinon (jamais d'exception)
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 6 contrôles de sécurité distincts — chaque garde-fou est testé et critique
export async function verifyLegalVersionCookie(
  rawCookie: string | undefined,
  secret: string,
  nowMs: number,
): Promise<LegalVersionCookiePayload | null> {
  if (!rawCookie || rawCookie.length === 0) return null;
  if (secret.length === 0) return null;

  const parts = rawCookie.split('.');
  if (parts.length !== 2) return null;
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
  const expectedSig = await sign(encodedPayload, secret);
  if (presentedSig.length !== expectedSig.length) return null;
  const presentedBytes = fromHex(presentedSig);
  const expectedBytes = fromHex(expectedSig);
  if (presentedBytes === null || expectedBytes === null) return null;
  if (!constantTimeEqual(presentedBytes, expectedBytes)) return null;

  // Décoder le payload
  const decoded = base64urlDecode(encodedPayload);
  if (decoded === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.userId !== 'string' || obj.userId.length === 0) return null;
  if (
    typeof obj.cguB2bVersion !== 'number' ||
    !Number.isInteger(obj.cguB2bVersion) ||
    obj.cguB2bVersion <= 0
  ) {
    return null;
  }
  if (typeof obj.exp !== 'number' || !Number.isFinite(obj.exp)) return null;
  if (obj.exp < nowMs) return null;

  return { userId: obj.userId, cguB2bVersion: obj.cguB2bVersion, exp: obj.exp };
}
