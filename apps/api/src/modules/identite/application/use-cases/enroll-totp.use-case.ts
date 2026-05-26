// EnrollTotpUseCase — flow d'enrôlement TOTP (US1, MVP P1).
//
// Deux opérations :
//   - `start`     : génère un secret + le chiffre + supersede + crée le
//                   batch de 10 backup codes (hashés bcrypt). Retourne
//                   clair (one-shot) au caller. Audit
//                   `mfa_enrollment_started`.
//   - `confirm`   : déchiffre le secret pending, vérifie le 1er code
//                   TOTP, active le secret (enabledAt = NOW), pose
//                   mfaVerifiedAt sur la session courante. Audit
//                   `mfa_enrolled`.
//
// Sécurité (Principe IX) :
//   - Le secret en clair ne quitte JAMAIS le scope de start() côté
//     serveur (sauf via la réponse HTTP UX), et n'est jamais loggé.
//   - Les codes clairs sont retournés UNE SEULE FOIS au caller (FR-005).
//   - Atomicité supersede via transaction (P0-1).
//   - Rate limit `enroll_start` 10/h (P1-1) géré au controller.

import { prisma } from '@cv/db';
import { generateBatch, normalizeCode } from '@cv/mfa';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BACKUP_CODE_HASHER, type BackupCodeHasher } from '../ports/backup-code-hasher.port';
import {
  BACKUP_CODE_REPOSITORY,
  type BackupCodeRepository,
} from '../ports/backup-code-repository.port';
import { MFA_AUDIT_WRITER, type MfaAuditWriter } from '../ports/mfa-audit-writer.port';
import {
  MFA_SECRET_REPOSITORY,
  type MfaSecretRepository,
} from '../ports/mfa-secret-repository.port';
import {
  TOTP_SECRET_ENCRYPTER,
  type TotpSecretEncrypter,
} from '../ports/totp-secret-encrypter.port';
import { TOTP_VALIDATOR, type TotpValidator } from '../ports/totp-validator.port';

export interface StartEnrollmentInput {
  readonly userId: string;
  readonly userEmail: string;
  readonly enrollmentRequestId: string;
  readonly actorIp?: string;
}

export interface StartEnrollmentResult {
  readonly secretBase32: string;
  readonly keyUri: string;
  readonly backupCodes: readonly string[];
  readonly enrollmentRequestId: string;
}

export interface ConfirmEnrollmentInput {
  readonly userId: string;
  readonly sessionToken: string;
  readonly enrollmentRequestId: string;
  readonly totpCode: string;
  readonly backupCodesAcknowledged: true;
  readonly actorIp?: string;
}

export interface ConfirmEnrollmentResult {
  readonly enabledAt: Date;
}

@Injectable()
export class EnrollTotpUseCase {
  constructor(
    @Inject(MFA_SECRET_REPOSITORY) private readonly secrets: MfaSecretRepository,
    @Inject(BACKUP_CODE_REPOSITORY) private readonly backupCodes: BackupCodeRepository,
    @Inject(TOTP_VALIDATOR) private readonly totpValidator: TotpValidator,
    @Inject(TOTP_SECRET_ENCRYPTER) private readonly encrypter: TotpSecretEncrypter,
    @Inject(BACKUP_CODE_HASHER) private readonly hasher: BackupCodeHasher,
    @Inject(MFA_AUDIT_WRITER) private readonly audit: MfaAuditWriter,
  ) {}

  async start(input: StartEnrollmentInput): Promise<StartEnrollmentResult> {
    // 1. Refus si MFA déjà actif — l'utilisateur doit passer par US4
    //    (reset admin) ou US6 (auto-service device change).
    const active = await this.secrets.findActiveByUserId(input.userId);
    if (active) {
      throw new ConflictException({ code: 'MFA_ALREADY_ENROLLED' });
    }

    // 2. Génère secret + chiffre.
    const secret = this.totpValidator.generateSecret();
    const encrypted = this.encrypter.encrypt(secret);

    // 3. Supersede : invalide tout pending existant + insert nouveau.
    //
    // BUG_008 ultraréview : race TOCTOU possible — entre la
    // findActiveByUserId ligne 86 et l'INSERT ici, un autre flow
    // peut activer un secret (via /confirm concurrent). Le repository
    // re-check sous transaction et throw `new Error('MFA_ALREADY_ENROLLED')`
    // — sans catch, le défaut NestJS produit 500 Internal Server
    // Error. Translation explicite en 409 ConflictException pour
    // contrat API cohérent.
    let created: Awaited<ReturnType<MfaSecretRepository['supersedePending']>>;
    try {
      created = await this.secrets.supersedePending({
        userId: input.userId,
        encryptedSecret: encrypted,
        enrollmentRequestId: input.enrollmentRequestId,
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'MFA_ALREADY_ENROLLED') {
        throw new ConflictException({ code: 'MFA_ALREADY_ENROLLED' });
      }
      throw e;
    }

    // 4. Génère 10 backup codes clairs + hash bcrypt.
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

    // 5. Audit (eventType: mfa_enrollment_started).
    await this.audit.append({
      eventType: 'mfa_enrollment_started',
      actorUserId: input.userId,
      targetUserId: input.userId,
      ...(input.actorIp ? { actorIp: input.actorIp } : {}),
      metadata: { enrollmentRequestId: input.enrollmentRequestId },
    });

    // 6. Retourne au caller — UNIQUE moment où les clairs existent.
    return {
      secretBase32: secret,
      keyUri: this.totpValidator.buildKeyUri(input.userEmail, secret),
      backupCodes: clearCodes,
      enrollmentRequestId: input.enrollmentRequestId,
    };
  }

  async confirm(input: ConfirmEnrollmentInput): Promise<ConfirmEnrollmentResult> {
    if (input.backupCodesAcknowledged !== true) {
      throw new BadRequestException({ code: 'BACKUP_CODES_NOT_ACKNOWLEDGED' });
    }

    // 1. Lookup du secret pending par enrollmentRequestId.
    const pending = await this.secrets.findByEnrollmentRequestId(input.enrollmentRequestId);
    if (!pending || pending.userId !== input.userId) {
      throw new NotFoundException({ code: 'ENROLLMENT_NOT_FOUND' });
    }
    if (pending.enabledAt !== null) {
      // Idempotence : déjà confirmé, on retourne le succès passé.
      return { enabledAt: pending.enabledAt };
    }

    // 2. Déchiffre le secret et vérifie le code TOTP.
    const clearSecret = this.encrypter.decrypt(pending.encryptedSecret);
    const codeValid = this.totpValidator.verify(clearSecret, normalizeCode(input.totpCode));
    if (!codeValid) {
      throw new BadRequestException({ code: 'INVALID_TOTP' });
    }

    // 3. Active le secret + pose mfaVerifiedAt sur la session courante.
    //    Atomicité par transaction Prisma.
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.mfaSecret.update({
        where: { id: pending.id },
        data: { enabledAt: now, lastUsedAt: now },
      });
      await tx.authSession.update({
        where: { sessionToken: input.sessionToken },
        data: { mfaVerifiedAt: now },
      });
    });

    // 4. Audit.
    await this.audit.append({
      eventType: 'mfa_enrolled',
      actorUserId: input.userId,
      targetUserId: input.userId,
      method: 'totp',
      ...(input.actorIp ? { actorIp: input.actorIp } : {}),
      metadata: {
        enrollmentRequestId: input.enrollmentRequestId,
        backupCodesGenerated: 10,
      },
    });

    return { enabledAt: now };
  }
}
