// T023 — issueToken + verifyToken (R2).
//
// JWT HS256 via `jose`. Le claim `purpose` empêche le rejeu cross-flow.
// Le claim `nonce` (UUID v4) sert d'idempotency key one-shot quand la
// ligne DB correspondante est supprimée à la consommation.
//
// Fonction pure côté logique de signature/vérif ; aucune I/O. Le secret
// HS256 est passé en paramètre (pas de lecture process.env directe).

import * as crypto from 'node:crypto';
import { type JWTPayload, SignJWT, jwtVerify } from 'jose';

export type TokenPurpose = 'email_verification' | 'password_reset' | 'admin_invitation';

export interface IssueTokenInput {
  readonly purpose: TokenPurpose;
  readonly userId: string;
  readonly ttlSec: number;
  /** Secret HS256 en base64 (32 octets décodés). */
  readonly secret: string;
  /** Permet de fixer l'instant pour la testabilité. */
  readonly now?: Date;
}

export interface IssuedToken {
  readonly token: string;
  readonly nonce: string;
  readonly expiresAt: Date;
}

export interface VerifyTokenInput {
  readonly token: string;
  readonly expectedPurpose: TokenPurpose;
  readonly secret: string;
  readonly now?: Date;
}

export interface VerifiedTokenPayload {
  readonly purpose: TokenPurpose;
  readonly userId: string;
  readonly nonce: string;
}

export type VerifyTokenResult =
  | { readonly ok: true; readonly payload: VerifiedTokenPayload }
  | { readonly ok: false; readonly code: 'INVALID_OR_EXPIRED_TOKEN' };

function decodeSecret(base64: string): Uint8Array {
  return Buffer.from(base64, 'base64');
}

export async function issueToken(input: IssueTokenInput): Promise<IssuedToken> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + input.ttlSec * 1000);
  const nonce = crypto.randomUUID();
  const secret = decodeSecret(input.secret);

  const token = await new SignJWT({
    purpose: input.purpose,
    userId: input.userId,
    nonce,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);

  return { token, nonce, expiresAt };
}

export async function verifyToken(input: VerifyTokenInput): Promise<VerifyTokenResult> {
  const secret = decodeSecret(input.secret);
  const now = input.now ?? new Date();
  let payload: JWTPayload;
  try {
    const result = await jwtVerify(input.token, secret, {
      algorithms: ['HS256'],
      currentDate: now,
    });
    payload = result.payload;
  } catch {
    return { ok: false, code: 'INVALID_OR_EXPIRED_TOKEN' };
  }

  const allowedPurposes: ReadonlySet<TokenPurpose> = new Set([
    'email_verification',
    'password_reset',
    'admin_invitation',
  ]);
  const rawPurpose = payload.purpose;
  if (typeof rawPurpose !== 'string' || !allowedPurposes.has(rawPurpose as TokenPurpose)) {
    return { ok: false, code: 'INVALID_OR_EXPIRED_TOKEN' };
  }
  const verifiedPurpose = rawPurpose as TokenPurpose;
  if (verifiedPurpose !== input.expectedPurpose) {
    return { ok: false, code: 'INVALID_OR_EXPIRED_TOKEN' };
  }

  if (typeof payload.userId !== 'string' || typeof payload.nonce !== 'string') {
    return { ok: false, code: 'INVALID_OR_EXPIRED_TOKEN' };
  }

  return {
    ok: true,
    payload: {
      purpose: verifiedPurpose,
      userId: payload.userId,
      nonce: payload.nonce,
    },
  };
}
