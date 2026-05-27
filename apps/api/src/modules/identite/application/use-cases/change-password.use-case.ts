// T102 — ChangePasswordUseCase (US6 P2).
//
// Vérif current password + politique + new != current + UPDATE password
// + DELETE autres sessions (sauf courante) + audit + outbox.
// StepUpGuard (002a) intercepte avant si MFA actif (FR-024).

import { prehashAndHash, validatePasswordPolicy, verifyPrehashed } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';

export interface ChangePasswordInput {
  readonly userId: string;
  readonly currentSessionToken: string;
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly actorIp?: string;
}

export interface ChangePasswordResult {
  readonly sessionsRevokedCount: number;
}

@Injectable()
export class ChangePasswordUseCase {
  constructor(@Inject(AUTH_AUDIT_WRITER) private readonly audit: AuthAuditWriter) {}

  async execute(input: ChangePasswordInput): Promise<ChangePasswordResult> {
    const account = await prisma.authAccount.findFirst({
      where: { userId: input.userId, provider: 'credentials' },
      select: { id: true, password_hash: true },
    });
    if (!account?.password_hash) {
      throw new UnauthorizedException({ code: 'INVALID_CURRENT_PASSWORD' });
    }

    const currentOk = await verifyPrehashed(input.currentPassword, account.password_hash);
    if (!currentOk) {
      await this.audit.append({
        eventType: 'password_change_failed',
        targetUserId: input.userId,
        actorIp: input.actorIp ?? null,
        metadata: { reason: 'INVALID_CURRENT' },
      });
      throw new UnauthorizedException({ code: 'INVALID_CURRENT_PASSWORD' });
    }

    // PASSWORD_REUSE : refus si new == current
    const sameAsOld = await verifyPrehashed(input.newPassword, account.password_hash);
    if (sameAsOld) {
      throw new BadRequestException({ code: 'PASSWORD_REUSE' });
    }

    const policy = validatePasswordPolicy(input.newPassword);
    if (!policy.ok) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', errors: policy.errors });
    }

    const newHash = await prehashAndHash(input.newPassword);
    const now = new Date();
    const user = await prisma.authUser.findUnique({
      where: { id: input.userId },
      select: { name: true, email: true },
    });
    const firstName = user?.name?.split(' ')[0] ?? 'utilisateur';
    const email = user?.email ?? '';

    const sessionsRevokedCount = await prisma.$transaction(async (tx) => {
      await tx.authAccount.update({
        where: { id: account.id },
        data: { password_hash: newHash },
      });
      const deleted = await tx.authSession.deleteMany({
        where: { userId: input.userId, sessionToken: { not: input.currentSessionToken } },
      });
      await tx.loginLockoutBucket.deleteMany({
        where: { kind: 'login_account', accountId: input.userId },
      });
      await tx.authOutboxEmail.create({
        data: {
          recipientUserId: input.userId,
          recipientEmail: email,
          templateKind: 'password_changed',
          payload: { firstName, changedAtIso: now.toISOString(), reason: 'change' },
        },
      });
      return deleted.count;
    });

    await this.audit.append({
      eventType: 'password_changed_self',
      targetUserId: input.userId,
      actorIp: input.actorIp ?? null,
      metadata: { sessionsRevokedCount },
    });

    return { sessionsRevokedCount };
  }
}
