// T092 — RequestPasswordResetUseCase (US5 P2).
//
// Anti-énumération uniforme : retour { kind: 'ok' } que l'email existe
// ou non. Side effects conditionnels seulement si compte existe + count
// tokens actifs < 3 (FR-022).

import { normalizeEmail } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  type PasswordResetTokenRepository,
} from '../ports/password-reset-token-repository.port';
import { TOKEN_ISSUER, type TokenIssuer } from '../ports/token-issuer.port';

export interface RequestPasswordResetInput {
  readonly emailRaw: string;
  readonly actorIp?: string;
}

export interface RequestPasswordResetResult {
  readonly kind: 'ok';
}

const PASSWORD_RESET_TTL_SEC = 60 * 60; // 1h (R10 / Q1)
const MAX_ACTIVE_TOKENS = 3;

@Injectable()
export class RequestPasswordResetUseCase {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly tokens: PasswordResetTokenRepository,
    @Inject(AUTH_AUDIT_WRITER) private readonly audit: AuthAuditWriter,
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<RequestPasswordResetResult> {
    const email = normalizeEmail(input.emailRaw);
    const user = await prisma.authUser.findUnique({
      where: { email },
      select: { id: true, name: true },
    });
    if (!user) {
      await this.audit.append({
        eventType: 'password_reset_requested',
        targetEmail: email,
        actorIp: input.actorIp ?? null,
        metadata: { unknown_user: true },
      });
      return { kind: 'ok' };
    }

    const now = new Date();
    const active = await this.tokens.countActiveByUserId(user.id, now);
    if (active >= MAX_ACTIVE_TOKENS) {
      await this.audit.append({
        eventType: 'password_reset_requested',
        targetUserId: user.id,
        targetEmail: email,
        actorIp: input.actorIp ?? null,
        metadata: { throttled: true, active_count: active },
      });
      return { kind: 'ok' };
    }

    const issued = await this.tokenIssuer.issue({
      purpose: 'password_reset',
      userId: user.id,
      ttlSec: PASSWORD_RESET_TTL_SEC,
      now,
    });
    const firstName = user.name?.split(' ')[0] ?? 'utilisateur';
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          jwtNonce: issued.nonce,
          expiresAt: issued.expiresAt,
        },
      });
      await tx.authOutboxEmail.create({
        data: {
          recipientUserId: user.id,
          recipientEmail: email,
          templateKind: 'password_reset',
          payload: {
            firstName,
            token: issued.token,
            expiresAt: issued.expiresAt.toISOString(),
          },
        },
      });
    });

    await this.audit.append({
      eventType: 'password_reset_requested',
      targetUserId: user.id,
      targetEmail: email,
      actorIp: input.actorIp ?? null,
      metadata: {},
    });
    return { kind: 'ok' };
  }
}
