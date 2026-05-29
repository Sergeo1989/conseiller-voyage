// T039 [TDD GREEN] — Service sign/verify HMAC SHA-256 du magic link.
//
// Combine HMAC(briefId || expiresAtUnix || clearToken) avec secret env
// `INTAKE_MAGIC_LINK_SECRET`. La signature voyage dans l'URL — elle
// empêche la falsification d'un autre champ (ex: changer le briefId tout
// en gardant le clearToken d'un autre voyageur).
//
// R1 + ADR-0018 : la vérification finale fait aussi un lookup DB du
// tokenHash. La signature est une défense en profondeur supplémentaire.

import { createHmac, timingSafeEqual } from 'node:crypto';

interface SignInput {
  readonly briefId: string;
  readonly expiresAtUnix: number;
  readonly clearToken: string;
  readonly secret: string;
}

interface VerifyInput extends SignInput {
  readonly signature: string;
}

function buildPayload(briefId: string, expiresAtUnix: number, clearToken: string): string {
  return `${briefId}|${expiresAtUnix}|${clearToken}`;
}

export function signMagicLink(input: SignInput): string {
  const hmac = createHmac('sha256', input.secret);
  hmac.update(buildPayload(input.briefId, input.expiresAtUnix, input.clearToken));
  return hmac.digest('hex');
}

export function verifyMagicLinkSignature(input: VerifyInput): boolean {
  const expected = signMagicLink({
    briefId: input.briefId,
    expiresAtUnix: input.expiresAtUnix,
    clearToken: input.clearToken,
    secret: input.secret,
  });
  if (expected.length !== input.signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(input.signature, 'hex'));
}
