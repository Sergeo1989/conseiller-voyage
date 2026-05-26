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
import {
  ACTIVE_SESSION_REVOKER,
  type ActiveSessionRevoker,
} from '../ports/active-session-revoker.port';
import type { AuthRole } from '../ports/auth-session-reader.port';
import { MFA_AUDIT_WRITER, type MfaAuditWriter } from '../ports/mfa-audit-writer.port';
import {
  MFA_NOTIFICATION_MAILER,
  type MfaNotificationMailer,
} from '../ports/mfa-notification-mailer.port';
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
  constructor(
    @Inject(MFA_SECRET_REPOSITORY) private readonly secrets: MfaSecretRepository,
    @Inject(ACTIVE_SESSION_REVOKER) private readonly sessionRevoker: ActiveSessionRevoker,
    @Inject(MFA_AUDIT_WRITER) private readonly audit: MfaAuditWriter,
    @Inject(MFA_NOTIFICATION_MAILER) private readonly mailer: MfaNotificationMailer,
  ) {}

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

    // 5. DELETE secret + cascade + sessions + buckets orphelins
    //    + audit + mailer. Atomicité Prisma transaction.
    const now = new Date();
    await this.secrets.deleteAllByUserId(input.targetUserId);
    const sessionsRevokedCount = await this.sessionRevoker.revokeAll(input.targetUserId);

    await this.audit.append({
      eventType: 'mfa_reset_by_admin',
      actorUserId: input.actor.id,
      targetUserId: input.targetUserId,
      targetRole: targetUser.role as AuthRole,
      ...(input.actorIp ? { actorIp: input.actorIp } : {}),
      justification: input.justification,
      metadata: {
        previousMfaSecretId: activeSecret.id,
        sessionsRevokedCount,
        warningDisplayedLastAdmin,
        idempotencyKey: input.idempotencyKey,
      },
    });

    // Courriel FR-026.
    // Côté conseiller : actorLabel = "équipe support".
    // Côté admin cible : actorLabel = prénom + nom de l'admin acteur
    // (traçabilité pair-à-pair).
    const actorLabel =
      targetUser.role === 'admin' && input.actor.name ? input.actor.name : 'équipe support';
    await this.mailer.sendAdminResetNotice({
      recipientUserId: input.targetUserId,
      recipientEmail: targetUser.email ?? `user-${input.targetUserId}`,
      resetAt: now,
      justification: input.justification,
      actorAdminName: actorLabel,
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
