// T023 — Encodage / décodage du cookie cv_suggested (FR-008a, R6).
//
// Format de la valeur du cookie :
//   <base64url(JSON.stringify(payload))>.<base64url(hmacSHA256(payload, secret))>
//
// La signature HMAC empêche toute manipulation côté client. Le payload est
// limité à 10 entrées FIFO pour rester sous la taille HTTP ~4 Ko.
//
// Note : on utilise node:crypto (HMAC-SHA256), donc ce module n'est PAS
// utilisable côté client (browser). C'est par conception : le cookie est
// posé par le middleware Next.js (server-side) et lu par les Server Actions
// (server-side). Le navigateur ne fait que transporter la valeur opaque.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SuggestedEntry {
  /** UUID v4 du conseiller consulté. */
  readonly cid: string;
  /** Timestamp Unix ms de l'insertion. */
  readonly ts: number;
}

export interface SuggestedCookiePayload {
  /** Version du format pour évolution future. Actuellement 1. */
  readonly v: 1;
  /** FIFO ordre = ordre d'insertion ; max 10 entrées. */
  readonly entries: readonly SuggestedEntry[];
}

const MAX_ENTRIES = 10;
const COOKIE_VERSION = 1;

/** Encode (base64url) un buffer ou une string. */
function base64urlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode (base64url) vers une string utf-8. Retourne null si invalide. */
function base64urlDecode(input: string): Buffer | null {
  try {
    const padded =
      input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
    return Buffer.from(padded, 'base64');
  } catch {
    return null;
  }
}

/**
 * Signe le payload encodé avec HMAC SHA-256 et le secret donné.
 * Retourne la valeur complète du cookie (`<payload>.<sig>`).
 */
export function encodeSuggestedCookie(payload: SuggestedCookiePayload, secret: string): string {
  const payloadStr = JSON.stringify(payload);
  const payloadEncoded = base64urlEncode(payloadStr);
  const sig = createHmac('sha256', secret).update(payloadEncoded).digest();
  const sigEncoded = base64urlEncode(sig);
  return `${payloadEncoded}.${sigEncoded}`;
}

/**
 * Décode et vérifie la signature HMAC d'un cookie. Retourne la liste des
 * entrées si OK, `null` si signature invalide / format invalide /
 * version inconnue.
 *
 * Le caller doit ENSUITE filtrer les entrées expirées via
 * `fenetreValiditeSuggested` (24h).
 */
export function decodeSuggestedCookie(value: string, secret: string): SuggestedEntry[] | null {
  const split = splitSignedCookie(value);
  if (!split) return null;
  if (!verifySignature(split.payloadEncoded, split.sigEncoded, secret)) return null;
  return parsePayload(split.payloadEncoded);
}

function splitSignedCookie(value: string): { payloadEncoded: string; sigEncoded: string } | null {
  if (!value || typeof value !== 'string') return null;
  const dotIndex = value.indexOf('.');
  if (dotIndex < 1 || dotIndex === value.length - 1) return null;
  return { payloadEncoded: value.slice(0, dotIndex), sigEncoded: value.slice(dotIndex + 1) };
}

function verifySignature(payloadEncoded: string, sigEncoded: string, secret: string): boolean {
  const expectedSig = createHmac('sha256', secret).update(payloadEncoded).digest();
  const providedSig = base64urlDecode(sigEncoded);
  if (!providedSig || providedSig.length !== expectedSig.length) return false;
  return timingSafeEqual(expectedSig, providedSig);
}

function parsePayload(payloadEncoded: string): SuggestedEntry[] | null {
  const payloadBuf = base64urlDecode(payloadEncoded);
  if (!payloadBuf) return null;
  try {
    const parsed = JSON.parse(payloadBuf.toString('utf8')) as SuggestedCookiePayload;
    if (parsed.v !== COOKIE_VERSION) return null;
    if (!Array.isArray(parsed.entries)) return null;
    if (!parsed.entries.every(isValidEntry)) return null;
    return parsed.entries.slice();
  } catch {
    return null;
  }
}

function isValidEntry(e: unknown): e is SuggestedEntry {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as SuggestedEntry).cid === 'string' &&
    typeof (e as SuggestedEntry).ts === 'number'
  );
}

/**
 * Ajoute (ou met à jour) une entrée dans la liste, en respectant :
 *   - Dédoublonnage par `cid` : si déjà présent, l'ancienne entrée est
 *     retirée et la nouvelle est placée en queue (FIFO mise à jour).
 *   - Plafond MAX_ENTRIES (10) : si dépassé, la plus ancienne est éjectée.
 *
 * Fonction pure : ne mute pas le tableau passé en entrée.
 */
export function appendEntry(
  existing: readonly SuggestedEntry[],
  cid: string,
  ts: number,
): SuggestedEntry[] {
  const filtered = existing.filter((e) => e.cid !== cid);
  const updated = [...filtered, { cid, ts }];
  if (updated.length > MAX_ENTRIES) {
    return updated.slice(updated.length - MAX_ENTRIES);
  }
  return updated;
}
