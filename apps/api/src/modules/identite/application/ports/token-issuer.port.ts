// T041 — Port d'émission/vérif de tokens à usage unique (feature 002 / R2).
//
// Abstrait `jose` HS256 derrière une interface pour permettre les mocks
// en tests et le swap éventuel (PASETO, RS256) sans toucher aux use cases.

import type { IssuedToken, TokenPurpose, VerifyTokenResult } from '@cv/auth-domain';

export interface TokenIssuer {
  issue(input: {
    readonly purpose: TokenPurpose;
    readonly userId: string;
    readonly ttlSec: number;
    readonly now?: Date;
  }): Promise<IssuedToken>;

  verify(input: {
    readonly token: string;
    readonly expectedPurpose: TokenPurpose;
    readonly now?: Date;
  }): Promise<VerifyTokenResult>;
}

export const TOKEN_ISSUER = Symbol.for('TokenIssuer');
