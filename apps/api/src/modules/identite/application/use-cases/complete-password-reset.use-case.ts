// T093 — CompletePasswordResetUseCase (US5 P2 / M7).
//
// Vérif token + validatePasswordPolicy + UPDATE password_hash + DELETE
// sessions (sauf courante si applicable, M7) + invalidate autres tokens
// + DELETE bucket lockout account + outbox confirmation + audit.

import { prehashAndHash, validatePasswordPolicy } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from '../ports/password-reset-token-repository.port';
import { TOKEN_ISSUER, type TokenIssuer } from '../ports/token-issuer.port';

export interface CompletePasswordResetInput {
  readonly token: string;
  readonly newPassword: string;
  /** Cookie session si l'utilisateur fait reset depuis un onglet connecté (M7). */
  readonly currentSessionToken?: string;
  readonly actorIp?: string;
}

export type CompletePasswordResetResult =
  | { readonly kind: 'ok'; readonly sessionsRevokedCount: number }
  | { readonly kind: 'invalid_or_expired' }
  | { readonly kind: 'validation_error'; readonly errors: readonly string[] };

@Injectable()
export class CompletePasswordResetUseCase {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly tokens: PasswordResetTokenRepository,
    @Inject(AUTH_AUDIT_WRITER) private readonly audit: AuthAuditWriter,
  ) {}

  async execute(input: CompletePasswordResetInput): Promise<CompletePasswordResetResult> {
    const verify = await this.tokenIssuer.verify({
      token: input.token,
      expectedPurpose: 'password_reset',
    });
    if (!verify.ok) return { kind: 'invalid_or_expired' };

    const { userId, nonce } = verify.payload;
    const now = new Date();
    const tokenRow = await this.tokens.findByNonceActive(nonce, now);
    if (!tokenRow || tokenRow.userId !== userId) {
      return { kind: 'invalid_or_expired' };
    }

    const policy = validatePasswordPolicy(input.newPassword);
    if (!policy.ok) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', errors: policy.errors });
    }

    const newHash = await prehashAndHash(input.newPassword);
    const comm = await this.fetchUserCommunication(userId);
    const sessionsRevokedCount = await this.runResetTransaction(
      userId,
      tokenRow.id,
      newHash,
      input.currentSessionToken,
      now,
      comm.firstName,
      comm.email,
    );

    await this.audit.append({
      eventType: 'password_reset_completed',
      targetUserId: userId,
      actorIp: input.actorIp ?? null,
      metadata: { sessionsRevokedCount, tokenId: tokenRow.id },
    });

    return { kind: 'ok', sessionsRevokedCount };
  }

  private async fetchUserCommunication(
    userId: string,
  ): Promise<{ firstName: string; email: string }> {
    const user = await prisma.authUser.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    return {
      firstName: user?.name?.split(' ')[0] ?? 'utilisateur',
      email: user?.email ?? '',
    };
  }

  private async runResetTransaction(
    userId: string,
    tokenId: string,
    newHash: string,
    currentSessionToken: string | undefined,
    now: Date,
    firstName: string,
    email: string,
  ): Promise<number> {
    return prisma.$transaction(async (tx) => {
      // UPDATE password_hash sur le compte credentials
      await tx.authAccount.updateMany({
        where: { userId, provider: 'credentials' },
        data: { password_hash: newHash },
      });

      // DELETE sessions — préserve la courante si applicable (M7)
      const sessionsDeleted = await tx.authSession.deleteMany({
        where: currentSessionToken
          ? { userId, sessionToken: { not: currentSessionToken } }
          : { userId },
      });

      // Marque token consommé + invalide autres tokens actifs
      await tx.passwordResetToken.update({
        where: { id: tokenId },
        data: { consumedAt: now },
      });
      await tx.passwordResetToken.updateMany({
        where: {
          userId,
          id: { not: tokenId },
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: now },
      });

      // Clean bucket account lockout
      await tx.loginLockoutBucket.deleteMany({
        where: { kind: 'login_account', accountId: userId },
      });

      // Outbox confirmation
      await tx.authOutboxEmail.create({
        data: {
          recipientUserId: userId,
          recipientEmail: email,
          templateKind: 'password_changed',
          payload: { firstName, changedAtIso: now.toISOString(), reason: 'reset' },
        },
      });

      return sessionsDeleted.count;
    });
  }
}
