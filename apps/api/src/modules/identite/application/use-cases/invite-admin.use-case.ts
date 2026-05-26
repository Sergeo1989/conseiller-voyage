// T112 — InviteAdminUseCase (US7 P2).

import { normalizeEmail } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_INVITATION_TOKEN_REPOSITORY,
  type AdminInvitationTokenRepository,
} from '../ports/admin-invitation-token-repository.port';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import { TOKEN_ISSUER, type TokenIssuer } from '../ports/token-issuer.port';

export interface InviteAdminInput {
  readonly actor: {
    readonly id: string;
    readonly email: string | null;
    readonly name: string | null;
  };
  readonly targetEmailRaw: string;
  readonly actorIp?: string;
}

export interface InviteAdminResult {
  readonly invitationId: string;
  readonly expiresAt: Date;
}

const ADMIN_INVITATION_TTL_SEC = 72 * 60 * 60; // 72h

@Injectable()
export class InviteAdminUseCase {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
    @Inject(ADMIN_INVITATION_TOKEN_REPOSITORY)
    private readonly tokens: AdminInvitationTokenRepository,
    @Inject(AUTH_AUDIT_WRITER) private readonly audit: AuthAuditWriter,
  ) {}

  async execute(input: InviteAdminInput): Promise<InviteAdminResult> {
    const targetEmail = normalizeEmail(input.targetEmailRaw);

    // SELF_INVITATION_FORBIDDEN
    if (input.actor.email && normalizeEmail(input.actor.email) === targetEmail) {
      throw new BadRequestException({ code: 'SELF_INVITATION_FORBIDDEN' });
    }

    // TARGET_EMAIL_ALREADY_REGISTERED (H6)
    const existing = await prisma.authUser.findUnique({
      where: { email: targetEmail },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({ code: 'TARGET_EMAIL_ALREADY_REGISTERED' });
    }

    // INVITATION_ALREADY_ACTIVE
    const now = new Date();
    const active = await this.tokens.findActiveByTargetEmail(targetEmail, now);
    if (active) {
      throw new ConflictException({
        code: 'INVITATION_ALREADY_ACTIVE',
        expiresAt: active.expiresAt.toISOString(),
      });
    }

    const issued = await this.tokenIssuer.issue({
      purpose: 'admin_invitation',
      userId: '00000000-0000-0000-0000-000000000000', // pas encore créé
      ttlSec: ADMIN_INVITATION_TTL_SEC,
      now,
    });

    const inviterFirstName = input.actor.name?.split(' ')[0] ?? 'un administrateur';
    let invitationId = '';
    await prisma.$transaction(async (tx) => {
      const row = await tx.adminInvitationToken.create({
        data: {
          targetEmail,
          inviterUserId: input.actor.id,
          jwtNonce: issued.nonce,
          expiresAt: issued.expiresAt,
        },
        select: { id: true },
      });
      invitationId = row.id;
      await tx.authOutboxEmail.create({
        data: {
          recipientUserId: null,
          recipientEmail: targetEmail,
          templateKind: 'admin_invitation',
          payload: {
            token: issued.token,
            expiresAt: issued.expiresAt.toISOString(),
            inviterName: inviterFirstName,
          },
        },
      });
    });

    await this.audit.append({
      eventType: 'admin_invitation_sent',
      actorUserId: input.actor.id,
      actorEmail: input.actor.email,
      targetEmail,
      actorIp: input.actorIp ?? null,
      metadata: { invitationId, ttlSec: ADMIN_INVITATION_TTL_SEC },
    });

    return { invitationId, expiresAt: issued.expiresAt };
  }
}
