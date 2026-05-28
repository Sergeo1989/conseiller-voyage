// T036 — Entité MagicLinkToken.
// Random 32 bytes hex côté code, stocké en SHA-256 hex côté DB (le clear
// n'est jamais persisté — R1 / ADR-0018).
// Cf. data-model.md *Entity: MagicLinkToken*.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { MagicLinkTokenId, VoyageurBriefId } from '@cv/shared/intake';
import type { MagicLinkPurpose } from '../../application/ports';

export interface MagicLinkToken {
  readonly id: MagicLinkTokenId;
  readonly briefId: VoyageurBriefId;
  readonly tokenHash: string; // SHA-256 hex 64 chars
  readonly purpose: MagicLinkPurpose;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

const RAW_TOKEN_BYTES = 32; // hex64

/** Génère un token clair (à inclure dans le mail + l'URL — jamais en DB). */
export function generateClearToken(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString('hex');
}

/** Hash SHA-256 hex 64 d'un token clair — c'est ce qui est stocké en DB. */
export function hashToken(clear: string): string {
  return createHash('sha256').update(clear).digest('hex');
}

/**
 * Comparaison timing-safe entre un hash candidat (calculé à partir du
 * clear claim) et le hash stocké. Empêche les timing attacks.
 */
export function tokenHashMatches(stored: string, candidate: string): boolean {
  const a = Buffer.from(stored, 'hex');
  const b = Buffer.from(candidate, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Vrai si le token est expiré à `now`. */
export function isExpired(token: MagicLinkToken, now: Date): boolean {
  return now >= token.expiresAt;
}

/** Vrai si déjà consommé (clic unique). */
export function isConsumed(token: MagicLinkToken): boolean {
  return token.consumedAt !== null;
}

/** Transition non consommé → consommé. Idempotent (return inchangé si déjà). */
export function markConsumed(token: MagicLinkToken, now: Date): MagicLinkToken {
  if (token.consumedAt !== null) return token;
  return { ...token, consumedAt: now };
}
