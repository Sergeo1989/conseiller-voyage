// ResetMfaAdminUseCase — US4 P2.
// Un admin réinitialise le MFA d'un user cible (conseiller OU autre
// admin), après vérification hors-bande.
//
// Side effects atomiques :
//   - DELETE MfaSecret cible (cascade backup codes via FK)
//   - DELETE sessions + buckets stepup orphelins (P0-3 via revoker)
//   - Audit mfa_reset_by_admin (immuable) avec justification +
//     targetRole + flag warningDisplayedLastAdmin
//   - Mailer FR-026 enqueué dans mfa_outbox_emails
//   - Invalidation cache `cv_active_admins_total` si targetRole=admin
//
// Validations :
//   - actor.role === 'admin' (RoleGuard côté controller)
//   - actor.id !== target.id (FR-022a — auto-reset interdit)
//   - target existe + a un secret actif (kind ok) OU pas (TARGET_NOT_ENROLLED)
//   - justification ≥ 20 chars (ZodValidationPipe)

import { prisma } from '@cv/db';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthRole } from '../ports/auth-session-reader.port';
import {
  MFA_SECRET_REPOSITORY,
  type MfaSecretRepository,
} from '../ports/mfa-secret-repository.port';

export interface ResetMfaAdminInput {
  readonly actor: { readonly id: string; readonly role: AuthRole; readonly name: string | null };
  readonly targetUserId: string;
  readonly justification: string;
  readonly idempotencyKey: string;
  readonly actorIp?: string;
}

export interface ResetMfaAdminResult {
  readonly resetAt: Date;
  readonly targetRole: AuthRole;
  readonly sessionsRevokedCount: number;
  readonly warningDisplayedLastAdmin: boolean;
}

@Injectable()
export class ResetMfaAdminUseCase {
  constructor(@Inject(MFA_SECRET_REPOSITORY) private readonly secrets: MfaSecretRepository) {}

  async execute(input: ResetMfaAdminInput): Promise<ResetMfaAdminResult> {
    // 1. Auto-reset interdit (FR-022a).
    if (input.actor.id === input.targetUserId) {
      throw new BadRequestException({ code: 'SELF_RESET_FORBIDDEN' });
    }

    // 2. Lookup target user (rôle + email pour le courriel).
    const targetUser = await prisma.authUser.findUnique({
      where: { id: input.targetUserId },
      select: { id: true, email: true, role: true },
    });
    if (!targetUser) {
      throw new NotFoundException({ code: 'TARGET_NOT_FOUND' });
    }

    // 3. Vérifier que la cible a bien un MFA actif.
    const activeSecret = await this.secrets.findActiveByUserId(input.targetUserId);
    if (!activeSecret) {
      throw new ConflictException({ code: 'TARGET_NOT_ENROLLED' });
    }

    // 4. Compteur d'admins actifs AVANT l'action — pour le warning
    //    "dernier autre admin" (FR-026b).
    const adminCountBefore = targetUser.role === 'admin' ? await this.countActiveAdmins() : 0;
    const warningDisplayedLastAdmin = targetUser.role === 'admin' && adminCountBefore === 2;

    // 5. BUG_002 ultraréview : VRAIMENT atomique. Le code précédent
    //    enchaînait `await` séquentiels (delete secret → revoke
    //    sessions → audit.append → mailer.send) — si l'audit ou le
    //    mailer plantait, le secret + les sessions étaient déjà
    //    supprimés sans trace immuable. Violation Principe IX
    //    (mutation sans audit), violation Loi 25 + FR-022.
    //
    //    Inclut maintenant dans UNE transaction :
    //      - DELETE secret (cascade backup codes via FK)
    //      - DELETE sessions du target
    //      - DELETE buckets stepup orphelins
    //      - INSERT audit immuable
    //      - INSERT mfa_outbox_emails (drainé async par worker SES)
    const now = new Date();
    const actorLabel =
      targetUser.role === 'admin' && input.actor.name ? input.actor.name : 'équipe support';

    const sessionsRevokedCount = await prisma.$transaction(async (tx) => {
      // a. DELETE secret cible (cascade FK backup codes).
      await tx.mfaSecret.deleteMany({ where: { userId: input.targetUserId } });

      // b. DELETE sessions du target + buckets stepup orphelins.
      const targetSessions = await tx.authSession.findMany({
        where: { userId: input.targetUserId },
        select: { id: true },
      });
      const sessionIds = targetSessions.map((s) => s.id);
      const sessionsDeleted = await tx.authSession.deleteMany({
        where: { userId: input.targetUserId },
      });
      if (sessionIds.length > 0) {
        await tx.mfaRateLimitBucket.deleteMany({
          where: {
            userId: input.targetUserId,
            kind: 'stepup_totp',
            sessionId: { in: sessionIds },
          },
        });
      }

      // c. Audit immuable.
      await tx.mfaAuditEvent.create({
        data: {
          eventType: 'mfa_reset_by_admin',
          actorUserId: input.actor.id,
          targetUserId: input.targetUserId,
          targetRole: targetUser.role as AuthRole,
          actorIp: input.actorIp ?? null,
          justification: input.justification,
          metadata: {
            previousMfaSecretId: activeSecret.id,
            sessionsRevokedCount: sessionsDeleted.count,
            warningDisplayedLastAdmin,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

      // d. Outbox email FR-026 (drainé par worker SES feature 003).
      await tx.mfaOutboxEmail.create({
        data: {
          recipientUserId: input.targetUserId,
          templateKind: 'admin_reset',
          payload: {
            resetAt: now.toISOString(),
            justification: input.justification,
            actorAdminName: actorLabel,
            recipientEmail: targetUser.email ?? `user-${input.targetUserId}`,
          },
        },
      });

      return sessionsDeleted.count;
    });

    return {
      resetAt: now,
      targetRole: targetUser.role as AuthRole,
      sessionsRevokedCount,
      warningDisplayedLastAdmin,
    };
  }

  /**
   * Compte les admins avec MFA actif. Pas de cache dans ce use case —
   * c'est un read léger (< 5 lignes) et la précision est critique pour
   * le warning FR-026b.
   */
  private async countActiveAdmins(): Promise<number> {
    return prisma.authUser.count({
      where: {
        role: 'admin',
        mfaSecrets: {
          some: { enabledAt: { not: null } },
        },
      },
    });
  }
}
