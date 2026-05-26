// VerifyBackupCodeUseCase — connexion via code de récupération (US3).
//
// FR-010 + FR-011 + FR-012 :
//   - Vérifie le code clair contre les hashes en BD via le hasher
//   - Consomme atomiquement via repository.consumeAtomic (P0-5)
//   - Retourne remainingCount + warnLowCodes (true si < 3 restants)
//   - Émet `mfa_backup_code_consumed` et, le cas échéant,
//     `mfa_backup_codes_warning_low` à la transition < 3 codes.

import { prisma } from '@cv/db';
import { normalizeCode } from '@cv/mfa';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { BACKUP_CODE_HASHER, type BackupCodeHasher } from '../ports/backup-code-hasher.port';
import {
  BACKUP_CODE_REPOSITORY,
  type BackupCodeRepository,
} from '../ports/backup-code-repository.port';
import { MFA_AUDIT_WRITER, type MfaAuditWriter } from '../ports/mfa-audit-writer.port';
import {
  MFA_NOTIFICATION_MAILER,
  type MfaNotificationMailer,
} from '../ports/mfa-notification-mailer.port';
import { MFA_RATE_LIMITER, type MfaRateLimiter } from '../ports/mfa-rate-limiter.port';
import {
  MFA_SECRET_REPOSITORY,
  type MfaSecretRepository,
} from '../ports/mfa-secret-repository.port';

export interface VerifyBackupCodeInput {
  readonly userId: string;
  readonly userEmail: string;
  readonly sessionToken: string;
  readonly backupCode: string;
  readonly actorIp?: string;
}

export type VerifyBackupCodeResult =
  | { kind: 'ok'; verifiedAt: Date; remainingCount: number; warnLowCodes: boolean }
  | { kind: 'invalid'; attemptsRemaining: number }
  | { kind: 'locked'; unlockAt: Date };

@Injectable()
export class VerifyBackupCodeUseCase {
  constructor(
    @Inject(MFA_SECRET_REPOSITORY) private readonly secrets: MfaSecretRepository,
    @Inject(BACKUP_CODE_REPOSITORY) private readonly backupCodes: BackupCodeRepository,
    @Inject(BACKUP_CODE_HASHER) private readonly hasher: BackupCodeHasher,
    @Inject(MFA_RATE_LIMITER) private readonly rateLimiter: MfaRateLimiter,
    @Inject(MFA_AUDIT_WRITER) private readonly audit: MfaAuditWriter,
    @Inject(MFA_NOTIFICATION_MAILER) private readonly mailer: MfaNotificationMailer,
  ) {}

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flow étape par étape — extraire fragmenterait la séquence
  async execute(input: VerifyBackupCodeInput): Promise<VerifyBackupCodeResult> {
    // 1. Lockout state (partagé avec verify TOTP — même bucket login_totp).
    const lockState = await this.rateLimiter.isLocked(input.userId, 'login_totp', null);
    if (lockState.locked && lockState.unlockAt) {
      return { kind: 'locked', unlockAt: lockState.unlockAt };
    }

    // 2. Lookup secret actif.
    const active = await this.secrets.findActiveByUserId(input.userId);
    if (!active) {
      throw new UnauthorizedException({ code: 'MFA_NOT_ENROLLED' });
    }

    // 3. Récupère tous les codes non consommés et tente le bcrypt compare
    //    sur chacun. Sur match → consumeAtomic (P0-5).
    const submitted = normalizeCode(input.backupCode);
    const candidates = await this.backupCodes.findUnusedByMfaSecret(active.id);

    let matchedId: string | null = null;
    for (const candidate of candidates) {
      if (await this.hasher.verify(submitted, candidate.codeHash)) {
        matchedId = candidate.id;
        break;
      }
    }

    if (matchedId) {
      const consumed = await this.backupCodes.consumeAtomic(matchedId);
      if (consumed) {
        const now = new Date();
        await prisma.authSession.update({
          where: { sessionToken: input.sessionToken },
          data: { mfaVerifiedAt: now },
        });
        await this.secrets.touchLastUsed(active.id);
        await this.rateLimiter.reset(input.userId, 'login_totp', null);

        const remainingCount = await this.backupCodes.countRemaining(active.id);
        const warnLowCodes = remainingCount < 3;

        await this.audit.append({
          eventType: 'mfa_backup_code_consumed',
          actorUserId: input.userId,
          targetUserId: input.userId,
          method: 'backup_code',
          ...(input.actorIp ? { actorIp: input.actorIp } : {}),
          metadata: { remainingCount },
        });
        // Émettre warning event uniquement à la transition (= au moment
        // où on tombe à 2 ou moins).
        if (warnLowCodes && remainingCount === 2) {
          await this.audit.append({
            eventType: 'mfa_backup_codes_warning_low',
            actorUserId: null,
            targetUserId: input.userId,
            metadata: { remainingCount },
          });
        }

        return { kind: 'ok', verifiedAt: now, remainingCount, warnLowCodes };
      }
      // Race lost — l'autre requête a consommé ce code. Traite comme
      // invalide pour ne pas leak l'info via timing.
    }

    // 4. Échec — code invalide ou race perdue. Incrémente le bucket
    //    partagé login_totp.
    const recorded = await this.rateLimiter.recordAttempt(input.userId, 'login_totp', null);

    if (recorded.lockedUntil) {
      await this.audit.append({
        eventType: 'mfa_login_locked',
        actorUserId: null,
        targetUserId: input.userId,
        ...(input.actorIp ? { actorIp: input.actorIp } : {}),
        metadata: {
          lockedUntil: recorded.lockedUntil.toISOString(),
          durationSec: 900,
        },
      });
      await this.mailer.sendLoginLockedNotice({
        recipientUserId: input.userId,
        recipientEmail: input.userEmail,
        lockedUntil: recorded.lockedUntil,
        attemptsInWindow: recorded.attempts,
      });
      return { kind: 'locked', unlockAt: recorded.lockedUntil };
    }

    await this.audit.append({
      eventType: 'mfa_login_failed',
      actorUserId: null,
      targetUserId: input.userId,
      method: 'backup_code',
      ...(input.actorIp ? { actorIp: input.actorIp } : {}),
      metadata: {
        attemptsInWindow: recorded.attempts,
        windowDurationSec: 300,
      },
    });

    const attemptsRemaining = Math.max(0, 5 - recorded.attempts);
    return { kind: 'invalid', attemptsRemaining };
  }
}
