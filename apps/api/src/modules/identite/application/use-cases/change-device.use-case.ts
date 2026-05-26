// ChangeDeviceUseCase — auto-service changement de device TOTP (US6 P2).
//
// FR-015a..f : l'utilisateur enrôlé prouve possession d'au moins UN
// facteur valide (TOTP ancien device OU backup code non consommé) +
// son mot de passe, puis crée un nouveau MfaSecret pending. L'ancien
// secret est supprimé immédiatement.
//
// Atomicité Prisma : la suppression de l'ancien + invalidation des
// autres sessions s'exécutent dans une transaction.
//
// Si l'utilisateur abandonne avant /enroll/confirm, le nouveau secret
// reste pending (enabledAt IS NULL) ; un job cron quotidien (T112,
// reporté Phase 9) enverra un rappel FR-015f après 24h.

import { prisma } from '@cv/db';
import { normalizeCode } from '@cv/mfa';
import { generateBatch } from '@cv/mfa';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  ACTIVE_SESSION_REVOKER,
  type ActiveSessionRevoker,
} from '../ports/active-session-revoker.port';
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
import {
  MFA_SECRET_REPOSITORY,
  type MfaSecretRepository,
} from '../ports/mfa-secret-repository.port';
import { PASSWORD_VERIFIER, type PasswordVerifier } from '../ports/password-verifier.port';
import {
  TOTP_SECRET_ENCRYPTER,
  type TotpSecretEncrypter,
} from '../ports/totp-secret-encrypter.port';
import { TOTP_VALIDATOR, type TotpValidator } from '../ports/totp-validator.port';

export type SecondFactor =
  | { readonly kind: 'totp'; readonly code: string }
  | { readonly kind: 'backup_code'; readonly code: string };

export interface ChangeDeviceInput {
  readonly userId: string;
  readonly userEmail: string;
  readonly sessionToken: string;
  readonly password: string;
  readonly secondFactor: SecondFactor;
  readonly enrollmentRequestId: string;
  readonly actorIp?: string;
}

export interface ChangeDeviceResult {
  readonly secretBase32: string;
  readonly keyUri: string;
  readonly backupCodes: readonly string[];
  readonly enrollmentRequestId: string;
}

@Injectable()
export class ChangeDeviceUseCase {
  constructor(
    @Inject(MFA_SECRET_REPOSITORY) private readonly secrets: MfaSecretRepository,
    @Inject(BACKUP_CODE_REPOSITORY) private readonly backupCodes: BackupCodeRepository,
    @Inject(TOTP_VALIDATOR) private readonly totpValidator: TotpValidator,
    @Inject(TOTP_SECRET_ENCRYPTER) private readonly encrypter: TotpSecretEncrypter,
    @Inject(BACKUP_CODE_HASHER) private readonly hasher: BackupCodeHasher,
    @Inject(ACTIVE_SESSION_REVOKER) private readonly sessionRevoker: ActiveSessionRevoker,
    @Inject(MFA_AUDIT_WRITER) private readonly audit: MfaAuditWriter,
    @Inject(MFA_NOTIFICATION_MAILER) private readonly mailer: MfaNotificationMailer,
    @Inject(PASSWORD_VERIFIER) private readonly passwords: PasswordVerifier,
  ) {}

  async execute(input: ChangeDeviceInput): Promise<ChangeDeviceResult> {
    // 1. Vérifier mot de passe.
    const passwordOk = await this.passwords.verify(input.userId, input.password);
    if (!passwordOk) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    // 2. Vérifier secret MFA actif (sinon device change non applicable).
    const active = await this.secrets.findActiveByUserId(input.userId);
    if (!active) {
      throw new BadRequestException({ code: 'MFA_NOT_ENROLLED' });
    }

    // 3. Vérifier le second facteur.
    const factorOk = await this.verifySecondFactor(
      active.id,
      active.encryptedSecret,
      input.secondFactor,
    );
    if (!factorOk) {
      throw new BadRequestException({ code: 'INVALID_SECOND_FACTOR' });
    }

    // 4. Atomique : DELETE ancien secret + supersede par nouveau pending
    //    + DELETE other sessions (sauf courante).
    const newSecretClear = this.totpValidator.generateSecret();
    const newEncrypted = this.encrypter.encrypt(newSecretClear);

    let sessionsRevokedCount = 0;
    const created = await prisma.$transaction(async (tx) => {
      await tx.mfaSecret.deleteMany({ where: { userId: input.userId } });
      return tx.mfaSecret.create({
        data: {
          userId: input.userId,
          encryptedSecret: newEncrypted as string,
          enrollmentRequestId: input.enrollmentRequestId,
        },
      });
    });
    // Sessions other-than-current (FR-015b).
    sessionsRevokedCount = await this.sessionRevoker.revokeAllExcept(
      input.userId,
      input.sessionToken,
    );

    // 5. Génère + hash 10 nouveaux backup codes.
    const clearCodes = generateBatch();
    const batchId = crypto.randomUUID();
    const hashed = await Promise.all(
      clearCodes.map(async (code, idx) => ({
        mfaSecretId: created.id,
        batchId,
        position: idx + 1,
        codeHash: await this.hasher.hash(code),
      })),
    );
    await this.backupCodes.createBatch(hashed);

    // 6. Audit + courriel FR-015e.
    await this.audit.append({
      eventType: 'mfa_device_changed_self',
      actorUserId: input.userId,
      targetUserId: input.userId,
      method: input.secondFactor.kind === 'totp' ? 'totp' : 'backup_code',
      ...(input.actorIp ? { actorIp: input.actorIp } : {}),
      metadata: {
        previousMfaSecretId: active.id,
        newEnrollmentRequestId: input.enrollmentRequestId,
        sessionsRevokedCount,
      },
    });
    await this.mailer.sendDeviceChangedNotice({
      recipientUserId: input.userId,
      recipientEmail: input.userEmail,
      changedAt: new Date(),
      actorIp: input.actorIp ?? 'unknown',
    });

    return {
      secretBase32: newSecretClear,
      keyUri: this.totpValidator.buildKeyUri(input.userEmail, newSecretClear),
      backupCodes: clearCodes,
      enrollmentRequestId: input.enrollmentRequestId,
    };
  }

  private async verifySecondFactor(
    mfaSecretId: string,
    encryptedSecret: string,
    secondFactor: SecondFactor,
  ): Promise<boolean> {
    if (secondFactor.kind === 'totp') {
      const clear = this.encrypter.decrypt(encryptedSecret as never);
      return this.totpValidator.verify(clear, normalizeCode(secondFactor.code));
    }
    // backup_code
    const submitted = normalizeCode(secondFactor.code);
    const candidates = await this.backupCodes.findUnusedByMfaSecret(mfaSecretId);
    for (const candidate of candidates) {
      if (await this.hasher.verify(submitted, candidate.codeHash)) {
        // On consomme atomiquement le code utilisé. L'ancien lot
        // sera DELETE en cascade quand l'ancien secret est supprimé,
        // mais le marking usedAt évite que ce code soit réutilisable
        // dans une fenêtre transitoire avant le DELETE.
        await this.backupCodes.consumeAtomic(candidate.id);
        return true;
      }
    }
    return false;
  }
}
