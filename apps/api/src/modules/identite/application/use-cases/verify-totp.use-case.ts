// VerifyTotpUseCase — vérification TOTP au login post-mot-de-passe (US3).
//
// FR-008 + FR-009 : après vérification mot de passe par Auth.js, l'API
// vérifie le code TOTP à 6 chiffres dans la fenêtre ±1 pas.
//
// Sécurité :
//   - 5 échecs en 5 min → lockout 15 min (FR-013) + courriel.
//   - Pas de step-up requis (c'est le 2e facteur du login, pas une
//     élévation intra-session).
//   - Sur succès : refresh mfaVerifiedAt, reset bucket, audit
//     mfa_login_verified, touche lastUsedAt du secret.

import { prisma } from '@cv/db';
import { normalizeCode } from '@cv/mfa';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
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
import {
  TOTP_SECRET_ENCRYPTER,
  type TotpSecretEncrypter,
} from '../ports/totp-secret-encrypter.port';
import { TOTP_VALIDATOR, type TotpValidator } from '../ports/totp-validator.port';

export interface VerifyTotpInput {
  readonly userId: string;
  readonly userEmail: string;
  readonly sessionToken: string;
  readonly totpCode: string;
  readonly actorIp?: string;
}

export type VerifyTotpResult =
  | { kind: 'ok'; verifiedAt: Date }
  | { kind: 'invalid'; attemptsRemaining: number }
  | { kind: 'locked'; unlockAt: Date };

@Injectable()
export class VerifyTotpUseCase {
  constructor(
    @Inject(MFA_SECRET_REPOSITORY) private readonly secrets: MfaSecretRepository,
    @Inject(TOTP_VALIDATOR) private readonly totpValidator: TotpValidator,
    @Inject(TOTP_SECRET_ENCRYPTER) private readonly encrypter: TotpSecretEncrypter,
    @Inject(MFA_RATE_LIMITER) private readonly rateLimiter: MfaRateLimiter,
    @Inject(MFA_AUDIT_WRITER) private readonly audit: MfaAuditWriter,
    @Inject(MFA_NOTIFICATION_MAILER) private readonly mailer: MfaNotificationMailer,
  ) {}

  async execute(input: VerifyTotpInput): Promise<VerifyTotpResult> {
    // 1. Vérifier verrouillage temporaire éventuel.
    const lockState = await this.rateLimiter.isLocked(input.userId, 'login_totp', null);
    if (lockState.locked && lockState.unlockAt) {
      return { kind: 'locked', unlockAt: lockState.unlockAt };
    }

    // 2. Lookup secret actif.
    const active = await this.secrets.findActiveByUserId(input.userId);
    if (!active) {
      throw new UnauthorizedException({ code: 'MFA_NOT_ENROLLED' });
    }

    // 3. Déchiffrer + verify.
    const clearSecret = this.encrypter.decrypt(active.encryptedSecret);
    const codeValid = this.totpValidator.verify(clearSecret, normalizeCode(input.totpCode));

    if (codeValid) {
      const now = new Date();
      await prisma.authSession.update({
        where: { sessionToken: input.sessionToken },
        data: { mfaVerifiedAt: now },
      });
      await this.secrets.touchLastUsed(active.id);
      await this.rateLimiter.reset(input.userId, 'login_totp', null);
      await this.audit.append({
        eventType: 'mfa_login_verified',
        actorUserId: input.userId,
        targetUserId: input.userId,
        method: 'totp',
        ...(input.actorIp ? { actorIp: input.actorIp } : {}),
      });
      return { kind: 'ok', verifiedAt: now };
    }

    // 4. Échec → incrémenter bucket login_totp.
    const recorded = await this.rateLimiter.recordAttempt(input.userId, 'login_totp', null);

    if (recorded.lockedUntil) {
      // 5 échecs atteints → lockout 15 min + courriel.
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
      method: 'totp',
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
