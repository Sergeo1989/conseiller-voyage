// T114 — ConsumeAdminInvitationUseCase (US7 P2).
//
// Transaction atomique : vérif token + race-check email + INSERT user +
// INSERT account + UPDATE token consumed + 2 events audit
// (admin_invitation_consumed + admin_created_by_admin).

import { prehashAndHash, validatePasswordPolicy } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_INVITATION_TOKEN_REPOSITORY,
  type AdminInvitationTokenRepository,
} from '../ports/admin-invitation-token-repository.port';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import { TOKEN_ISSUER, type TokenIssuer } from '../ports/token-issuer.port';

export interface ConsumeAdminInvitationInput {
  readonly token: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly password: string;
  readonly actorIp?: string;
}

export type ConsumeAdminInvitationResult =
  | { readonly kind: 'ok'; readonly userId: string; readonly email: string }
  | { readonly kind: 'invalid_or_expired' }
  | { readonly kind: 'target_email_already_registered' };

@Injectable()
export class ConsumeAdminInvitationUseCase {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
    @Inject(ADMIN_INVITATION_TOKEN_REPOSITORY)
    private readonly tokens: AdminInvitationTokenRepository,
    @Inject(AUTH_AUDIT_WRITER) private readonly audit: AuthAuditWriter,
  ) {}

  async execute(input: ConsumeAdminInvitationInput): Promise<ConsumeAdminInvitationResult> {
    const verify = await this.tokenIssuer.verify({
      token: input.token,
      expectedPurpose: 'admin_invitation',
    });
    if (!verify.ok) return { kind: 'invalid_or_expired' };

    const policy = validatePasswordPolicy(input.password, undefined, input.firstName);
    if (!policy.ok) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', errors: policy.errors });
    }

    const now = new Date();
    const tokenRow = await this.tokens.findByNonceUnconsumedNotExpired(verify.payload.nonce, now);
    if (!tokenRow) return { kind: 'invalid_or_expired' };

    // Race-check : email pris entre invitation et accept
    const exists = await prisma.authUser.findUnique({
      where: { email: tokenRow.targetEmail },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException({ code: 'TARGET_EMAIL_ALREADY_REGISTERED' });
    }

    const passwordHash = await prehashAndHash(input.password);
    const inviterUserId = tokenRow.inviterUserId;

    const newUserId = await prisma.$transaction(async (tx) => {
      const user = await tx.authUser.create({
        data: {
          email: tokenRow.targetEmail,
          role: 'admin',
          emailVerified: now, // lien email = preuve de propriété
          name: `${input.firstName} ${input.lastName}`,
        },
        select: { id: true },
      });
      await tx.authAccount.create({
        data: {
          userId: user.id,
          type: 'credentials',
          provider: 'credentials',
          providerAccountId: tokenRow.targetEmail,
          password_hash: passwordHash,
        },
      });
      await tx.adminInvitationToken.update({
        where: { id: tokenRow.id },
        data: { consumedAt: now, createdAuthUserId: user.id },
      });
      return user.id;
    });

    // Deux events d'audit : consumed + created_by_admin (cf. data-model + contract)
    await this.audit.append({
      eventType: 'admin_invitation_consumed',
      actorUserId: inviterUserId,
      targetUserId: newUserId,
      targetEmail: tokenRow.targetEmail,
      actorIp: input.actorIp ?? null,
      metadata: { invitationId: tokenRow.id },
    });
    await this.audit.append({
      eventType: 'admin_created_by_admin',
      actorUserId: inviterUserId,
      targetUserId: newUserId,
      targetEmail: tokenRow.targetEmail,
      actorIp: input.actorIp ?? null,
      metadata: { invitationId: tokenRow.id },
    });

    return { kind: 'ok', userId: newUserId, email: tokenRow.targetEmail };
  }
}
