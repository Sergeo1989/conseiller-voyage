// T050 — JoseTokenIssuer (feature 002 / R2).
//
// Wrappe les fonctions pures `issueToken` / `verifyToken` de
// `@cv/auth-domain/single-use-tokens` pour les injecter via DI NestJS.
// Lit `AUTH_TOKEN_SECRET` depuis l'env validé.

import { type IssuedToken, type VerifyTokenResult, issueToken, verifyToken } from '@cv/auth-domain';
import type { TokenPurpose } from '@cv/auth-domain';
import { Inject, Injectable } from '@nestjs/common';
import type { Env } from '../../../env';
import type { TokenIssuer } from '../application/ports/token-issuer.port';
import { ENV_TOKEN } from './node-crypto-totp-secret-encrypter';

@Injectable()
export class JoseTokenIssuer implements TokenIssuer {
  constructor(@Inject(ENV_TOKEN) private readonly env: Env) {}

  issue(input: {
    readonly purpose: TokenPurpose;
    readonly userId: string;
    readonly ttlSec: number;
    readonly now?: Date;
  }): Promise<IssuedToken> {
    return issueToken({
      purpose: input.purpose,
      userId: input.userId,
      ttlSec: input.ttlSec,
      secret: this.env.AUTH_TOKEN_SECRET,
      ...(input.now ? { now: input.now } : {}),
    });
  }

  verify(input: {
    readonly token: string;
    readonly expectedPurpose: TokenPurpose;
    readonly now?: Date;
  }): Promise<VerifyTokenResult> {
    return verifyToken({
      token: input.token,
      expectedPurpose: input.expectedPurpose,
      secret: this.env.AUTH_TOKEN_SECRET,
      ...(input.now ? { now: input.now } : {}),
    });
  }
}
