// T109 — BootstrapAdminUseCase (US7 P2 scénario 1).
//
// Crée le premier admin sur une base vide. Refuse si un admin existe
// déjà (sauf --force). Pas de MFA enrôlé (politique J1 unifiée — le
// premier login redirige vers /admin/mfa/enroll, R Q3).

import { normalizeEmail, prehashAndHash, validatePasswordPolicy } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';

export interface BootstrapAdminInput {
  readonly emailRaw: string;
  readonly password: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly force?: boolean;
}

export type BootstrapAdminResult =
  | { readonly kind: 'ok'; readonly userId: string }
  | { readonly kind: 'admin_already_exists' }
  | { readonly kind: 'invalid_email' }
  | { readonly kind: 'invalid_password'; readonly errors: readonly string[] };

@Injectable()
export class BootstrapAdminUseCase {
  constructor(@Inject(AUTH_AUDIT_WRITER) private readonly audit: AuthAuditWriter) {}

  async execute(input: BootstrapAdminInput): Promise<BootstrapAdminResult> {
    const email = normalizeEmail(input.emailRaw);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { kind: 'invalid_email' };
    }
    const policy = validatePasswordPolicy(input.password, email, input.firstName);
    if (!policy.ok) return { kind: 'invalid_password', errors: policy.errors };

    if (!input.force) {
      const existingAdmins = await prisma.authUser.count({ where: { role: 'admin' } });
      if (existingAdmins > 0) return { kind: 'admin_already_exists' };
    }

    const passwordHash = await prehashAndHash(input.password);
    const now = new Date();
    const newUserId = await prisma.$transaction(async (tx) => {
      const user = await tx.authUser.create({
        data: {
          email,
          role: 'admin',
          emailVerified: now, // bootstrap = email pré-vérifié
          name: `${input.firstName} ${input.lastName}`,
        },
        select: { id: true },
      });
      await tx.authAccount.create({
        data: {
          userId: user.id,
          type: 'credentials',
          provider: 'credentials',
          providerAccountId: email,
          password_hash: passwordHash,
        },
      });
      return user.id;
    });

    await this.audit.append({
      eventType: 'admin_bootstrap',
      // actorUserId NULL — pas d'acteur identifié (bootstrap initial)
      targetUserId: newUserId,
      targetEmail: email,
      metadata: { source: 'cli_bootstrap', force: input.force === true },
    });

    return { kind: 'ok', userId: newUserId };
  }
}
