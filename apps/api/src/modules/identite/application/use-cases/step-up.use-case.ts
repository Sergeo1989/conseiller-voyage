// StepUpUseCase — élévation de session pour une action sensible (US2).
//
// FR-016 à FR-021 : vérifie un code TOTP au sein d'une session déjà
// authentifiée. Refresh `AuthSession.mfaVerifiedAt` sur succès.
//
// Sur 3 échecs consécutifs dans la même session (bucket
// `stepup_totp` per-session — P0-3 du review) :
//   - DELETE la session courante (révocation)
//   - Audit `mfa_stepup_session_killed`
//   - Courriel FR-020a à l'utilisateur (timestamp, IP, action tentée)
//
// Sécurité :
//   - Le bucket est scoped par session (P0-3) : un attaquant qui
//     consomme les 3 tentatives dans SA session ne bloque pas les
//     autres sessions légitimes du même user.
//   - L'utilisateur doit déjà être authentifié (AuthGuard côté controller).

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

export interface StepUpInput {
  readonly userId: string;
  readonly userEmail: string;
  readonly sessionId: string;
  readonly sessionToken: string;
  readonly totpCode: string;
  readonly intendedAction: string;
  readonly actorIp?: string;
}

export type StepUpResult =
  | { kind: 'ok'; verifiedAt: Date }
  | { kind: 'invalid'; attemptsRemaining: number }
  | { kind: 'session_killed' };

@Injectable()
export class StepUpUseCase {
  constructor(
    @Inject(MFA_SECRET_REPOSITORY) private readonly secrets: MfaSecretRepository,
    @Inject(TOTP_VALIDATOR) private readonly totpValidator: TotpValidator,
    @Inject(TOTP_SECRET_ENCRYPTER) private readonly encrypter: TotpSecretEncrypter,
    @Inject(MFA_RATE_LIMITER) private readonly rateLimiter: MfaRateLimiter,
    @Inject(MFA_AUDIT_WRITER) private readonly audit: MfaAuditWriter,
    @Inject(MFA_NOTIFICATION_MAILER) private readonly mailer: MfaNotificationMailer,
  ) {}

  async execute(input: StepUpInput): Promise<StepUpResult> {
    const active = await this.secrets.findActiveByUserId(input.userId);
    if (!active) {
      throw new UnauthorizedException({ code: 'MFA_NOT_ENROLLED' });
    }

    const clearSecret = this.encrypter.decrypt(active.encryptedSecret);
    const codeValid = this.totpValidator.verify(clearSecret, normalizeCode(input.totpCode));

    if (codeValid) {
      const now = new Date();
      await prisma.authSession.update({
        where: { sessionToken: input.sessionToken },
        data: { mfaVerifiedAt: now },
      });
      await this.rateLimiter.reset(input.userId, 'stepup_totp', input.sessionId);
      await this.audit.append({
        eventType: 'mfa_stepup_verified',
        actorUserId: input.userId,
        targetUserId: input.userId,
        method: 'totp',
        ...(input.actorIp ? { actorIp: input.actorIp } : {}),
        metadata: { intendedAction: input.intendedAction, sessionId: input.sessionId },
      });
      return { kind: 'ok', verifiedAt: now };
    }

    // Code invalide → incrémenter le bucket per-session.
    const recorded = await this.rateLimiter.recordAttempt(
      input.userId,
      'stepup_totp',
      input.sessionId,
    );

    if (recorded.lockedUntil) {
      // 3 échecs atteints → session_killed.
      await prisma.authSession.delete({ where: { sessionToken: input.sessionToken } });
      await this.audit.append({
        eventType: 'mfa_stepup_session_killed',
        actorUserId: input.userId,
        targetUserId: input.userId,
        ...(input.actorIp ? { actorIp: input.actorIp } : {}),
        metadata: {
          intendedAction: input.intendedAction,
          sessionId: input.sessionId,
          notificationSent: true,
        },
      });
      // Courriel FR-020a — enqueué dans MfaOutboxEmail (stub MVP).
      await this.mailer.sendStepUpSessionKilledNotice({
        recipientUserId: input.userId,
        recipientEmail: input.userEmail,
        killedAt: new Date(),
        actorIp: input.actorIp ?? 'unknown',
        intendedAction: input.intendedAction,
      });
      return { kind: 'session_killed' };
    }

    await this.audit.append({
      eventType: 'mfa_stepup_failed',
      actorUserId: input.userId,
      targetUserId: input.userId,
      method: 'totp',
      ...(input.actorIp ? { actorIp: input.actorIp } : {}),
      metadata: {
        intendedAction: input.intendedAction,
        sessionId: input.sessionId,
        attemptsInModal: recorded.attempts,
      },
    });

    const attemptsRemaining = Math.max(0, 3 - recorded.attempts);
    return { kind: 'invalid', attemptsRemaining };
  }
}

// Helper exporté pour les contrôleurs.
export function isInvalidStepUp(
  result: StepUpResult,
): result is Extract<StepUpResult, { kind: 'invalid' }> {
  return result.kind === 'invalid';
}
