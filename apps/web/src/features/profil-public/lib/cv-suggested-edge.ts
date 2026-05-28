// Helper HMAC SHA-256 compatible Edge runtime Next.js (middleware).
//
// Le package @cv/profil-domain/suggested-cookie utilise `node:crypto` qui
// n'est pas disponible en Edge runtime. Ce helper utilise Web Crypto API
// (crypto.subtle) qui produit un résultat binaire identique.
//
// Format de cookie strictement aligné avec encodeSuggestedCookie du
// domaine pur :
//   <base64url(JSON.stringify(payload))>.<base64url(hmacSHA256(payloadStr))>
//
// Cf. specs/007-profil-conseiller/contracts/intake-suggested-middleware.md

export interface SuggestedEntry {
  readonly cid: string;
  readonly ts: number;
}

interface SuggestedCookiePayload {
  readonly v: 1;
  readonly entries: readonly SuggestedEntry[];
}

const MAX_ENTRIES = 10;
const COOKIE_VERSION = 1;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function base64urlEncode(bytes: Uint8Array | string): string {
  const buf = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  let bin = '';
  for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i] as number);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input: string): Uint8Array | null {
  try {
    const padded =
      input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= (a[i] as number) ^ (b[i] as number);
  }
  return diff === 0;
}

export async function encodeSuggestedCookie(
  entries: readonly SuggestedEntry[],
  secret: string,
): Promise<string> {
  const payload: SuggestedCookiePayload = { v: COOKIE_VERSION, entries };
  const payloadStr = JSON.stringify(payload);
  const payloadEncoded = base64urlEncode(payloadStr);
  const sig = await hmacSha256(secret, payloadEncoded);
  const sigEncoded = base64urlEncode(sig);
  return `${payloadEncoded}.${sigEncoded}`;
}

export async function decodeSuggestedCookie(
  value: string,
  secret: string,
): Promise<SuggestedEntry[] | null> {
  if (!value || typeof value !== 'string') return null;
  const dotIndex = value.indexOf('.');
  if (dotIndex < 1 || dotIndex === value.length - 1) return null;
  const payloadEncoded = value.slice(0, dotIndex);
  const sigEncoded = value.slice(dotIndex + 1);

  const expected = await hmacSha256(secret, payloadEncoded);
  const provided = base64urlDecode(sigEncoded);
  if (!provided || !constantTimeEqual(expected, provided)) return null;

  const payloadBuf = base64urlDecode(payloadEncoded);
  if (!payloadBuf) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payloadBuf)) as SuggestedCookiePayload;
    if (parsed.v !== COOKIE_VERSION) return null;
    if (!Array.isArray(parsed.entries)) return null;
    return parsed.entries.filter(isValidEntry);
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

export function filterFreshEntries(
  entries: readonly SuggestedEntry[],
  nowMs: number,
): SuggestedEntry[] {
  return entries.filter((e) => nowMs - e.ts > 0 && nowMs - e.ts < TWENTY_FOUR_HOURS_MS);
}

export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
