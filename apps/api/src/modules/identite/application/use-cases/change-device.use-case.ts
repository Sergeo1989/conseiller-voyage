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
import { generateBatch, normalizeCode } from '@cv/mfa';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { BACKUP_CODE_HASHER, type BackupCodeHasher } from '../ports/backup-code-hasher.port';
import {
  BACKUP_CODE_REPOSITORY,
  type BackupCodeRepository,
} from '../ports/backup-code-repository.port';
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
  readonly sessionsRevokedCount: number;
}

@Injectable()
export class ChangeDeviceUseCase {
  constructor(
    @Inject(MFA_SECRET_REPOSITORY) private readonly secrets: MfaSecretRepository,
    @Inject(BACKUP_CODE_REPOSITORY) private readonly backupCodes: BackupCodeRepository,
    @Inject(TOTP_VALIDATOR) private readonly totpValidator: TotpValidator,
    @Inject(TOTP_SECRET_ENCRYPTER) private readonly encrypter: TotpSecretEncrypter,
    @Inject(BACKUP_CODE_HASHER) private readonly hasher: BackupCodeHasher,
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

    // 4. Préparation des données pour la transaction (CPU bound,
    //    hors tx pour ne pas tenir une connexion Postgres).
    const newSecretClear = this.totpValidator.generateSecret();
    const newEncrypted = this.encrypter.encrypt(newSecretClear);
    const clearCodes = generateBatch();
    const batchId = crypto.randomUUID();
    const hashedCodes = await Promise.all(
      clearCodes.map(async (code, idx) => ({
        batchId,
        position: idx + 1,
        codeHash: (await this.hasher.hash(code)) as string,
      })),
    );

    // 5. BUG_002 ultraréview : VRAIMENT atomique cette fois. Toutes
    //    les écritures DB dans une seule transaction. Si l'une
    //    échoue, AUCUNE n'est appliquée. Garanties Loi 25 + FR-015b
    //    + Principe IX (mutation sans audit interdite) préservées.
    //
    //    Inclut :
    //      - DELETE ancien secret (cascade backup codes via FK)
    //      - INSERT nouveau secret pending
    //      - INSERT nouveaux backup codes
    //      - DELETE other sessions (FR-015b session invalidation)
    //      - DELETE buckets stepup orphelins des sessions supprimées
    //      - INSERT audit mfa_device_changed_self
    //      - INSERT mfa_outbox_emails (= équivalent SesMfaNotificationMailer
    //        stub MVP — quand 003 livre le worker SES, il drainera
    //        l'outbox sans qu'on change ce use case)
    const result = await prisma.$transaction(async (tx) => {
      // a. Swap atomique du secret
      await tx.mfaSecret.deleteMany({ where: { userId: input.userId } });
      const created = await tx.mfaSecret.create({
        data: {
          userId: input.userId,
          encryptedSecret: newEncrypted as string,
          enrollmentRequestId: input.enrollmentRequestId,
        },
      });

      // b. Backup codes du nouveau lot
      await tx.mfaBackupCode.createMany({
        data: hashedCodes.map((c) => ({
          mfaSecretId: created.id,
          batchId: c.batchId,
          position: c.position,
          codeHash: c.codeHash,
        })),
      });

      // c. Sessions other-than-current + cleanup buckets stepup
      const targetSessions = await tx.authSession.findMany({
        where: { userId: input.userId, sessionToken: { not: input.sessionToken } },
        select: { id: true },
      });
      const sessionIds = targetSessions.map((s) => s.id);
      const sessionsResult = await tx.authSession.deleteMany({
        where: { userId: input.userId, sessionToken: { not: input.sessionToken } },
      });
      if (sessionIds.length > 0) {
        await tx.mfaRateLimitBucket.deleteMany({
          where: { userId: input.userId, kind: 'stepup_totp', sessionId: { in: sessionIds } },
        });
      }

      // d. Audit immuable
      await tx.mfaAuditEvent.create({
        data: {
          eventType: 'mfa_device_changed_self',
          actorUserId: input.userId,
          targetUserId: input.userId,
          method: input.secondFactor.kind === 'totp' ? 'totp' : 'backup_code',
          actorIp: input.actorIp ?? null,
          metadata: {
            previousMfaSecretId: active.id,
            newEnrollmentRequestId: input.enrollmentRequestId,
            sessionsRevokedCount: sessionsResult.count,
          },
        },
      });

      // e. Outbox email FR-015e (worker SES drainera plus tard)
      await tx.mfaOutboxEmail.create({
        data: {
          recipientUserId: input.userId,
          templateKind: 'device_changed',
          payload: {
            changedAt: new Date().toISOString(),
            actorIp: input.actorIp ?? 'unknown',
            recipientEmail: input.userEmail,
          },
        },
      });

      return { sessionsRevokedCount: sessionsResult.count };
    });

    return {
      secretBase32: newSecretClear,
      keyUri: this.totpValidator.buildKeyUri(input.userEmail, newSecretClear),
      backupCodes: clearCodes,
      enrollmentRequestId: input.enrollmentRequestId,
      sessionsRevokedCount: result.sessionsRevokedCount,
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
