// T078 — VerifyEmailUseCase (US3 P1 MVP).
//
// Vérifie la signature du JWT (purpose=email_verification), lookup le
// nonce en DB, marque le token consommé, pose emailVerified=NOW sur le
// user. Le tout en transaction atomique (cohérence + idempotence).

import { prisma } from '@cv/db';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import { TOKEN_ISSUER, type TokenIssuer } from '../ports/token-issuer.port';

export interface VerifyEmailInput {
  readonly token: string;
  readonly actorIp?: string;
}

export type VerifyEmailResult =
  | { readonly kind: 'ok'; readonly userId: string }
  | { readonly kind: 'invalid_or_expired' };

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
    @Inject(AUTH_AUDIT_WRITER) private readonly audit: AuthAuditWriter,
  ) {}

  async execute(input: VerifyEmailInput): Promise<VerifyEmailResult> {
    const verify = await this.tokenIssuer.verify({
      token: input.token,
      expectedPurpose: 'email_verification',
    });
    if (!verify.ok) {
      return { kind: 'invalid_or_expired' };
    }
    const { userId, nonce } = verify.payload;
    const now = new Date();

    // Transaction atomique : lookup token actif + UPDATE user emailVerified
    // + UPDATE token consumedAt. Si une étape échoue, rollback global.
    const consumed = await prisma.$transaction(async (tx) => {
      const tokenRow = await tx.emailVerificationToken.findFirst({
        where: {
          jwtNonce: nonce,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true, userId: true },
      });
      if (!tokenRow || tokenRow.userId !== userId) {
        return null;
      }
      await tx.authUser.update({
        where: { id: userId },
        data: { emailVerified: now },
      });
      await tx.emailVerificationToken.update({
        where: { id: tokenRow.id },
        data: { consumedAt: now },
      });
      return tokenRow.id;
    });

    if (!consumed) {
      return { kind: 'invalid_or_expired' };
    }

    await this.audit.append({
      eventType: 'email_verified',
      targetUserId: userId,
      actorIp: input.actorIp ?? null,
      metadata: { tokenId: consumed },
    });

    return { kind: 'ok', userId };
  }
}
