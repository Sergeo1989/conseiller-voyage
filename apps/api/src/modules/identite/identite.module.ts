// Module NestJS identité.
//
// Phase 2 de feature 005 (MFA) — wiring de tous les ports MFA + guards.
// Les use cases et contrôleurs HTTP MFA arrivent en Phase 3 (US1)
// et au-delà.

import { Module } from '@nestjs/common';
import { env } from '../../env';
import { ACTIVE_SESSION_REVOKER } from './application/ports/active-session-revoker.port';
import { AUTH_SESSION_READER } from './application/ports/auth-session-reader.port';
import { BACKUP_CODE_HASHER } from './application/ports/backup-code-hasher.port';
import { BACKUP_CODE_REPOSITORY } from './application/ports/backup-code-repository.port';
import { MFA_AUDIT_WRITER } from './application/ports/mfa-audit-writer.port';
import { MFA_NOTIFICATION_MAILER } from './application/ports/mfa-notification-mailer.port';
import { MFA_RATE_LIMITER } from './application/ports/mfa-rate-limiter.port';
import { MFA_SECRET_REPOSITORY } from './application/ports/mfa-secret-repository.port';
import { TOTP_SECRET_ENCRYPTER } from './application/ports/totp-secret-encrypter.port';
import { TOTP_VALIDATOR } from './application/ports/totp-validator.port';
import { EnrollTotpUseCase } from './application/use-cases/enroll-totp.use-case';
import { BcryptBackupCodeHasher } from './infrastructure/bcrypt-backup-code-hasher';
import {
  ENV_TOKEN,
  NodeCryptoTotpSecretEncrypter,
} from './infrastructure/node-crypto-totp-secret-encrypter';
import { OtplibTotpValidator } from './infrastructure/otplib-totp-validator';
import { PostgresMfaRateLimiter } from './infrastructure/postgres-mfa-rate-limiter';
import { PrismaActiveSessionRevoker } from './infrastructure/prisma-active-session-revoker';
import { PrismaAuthSessionReader } from './infrastructure/prisma-auth-session-reader';
import { PrismaBackupCodeRepository } from './infrastructure/prisma-backup-code-repository';
import { PrismaMfaAuditWriter } from './infrastructure/prisma-mfa-audit-writer';
import { PrismaMfaSecretRepository } from './infrastructure/prisma-mfa-secret-repository';
import { SesMfaNotificationMailer } from './infrastructure/ses-mfa-notification-mailer';
import { AuthGuard } from './interface/auth.guard';
import { MfaEnrollmentController } from './interface/mfa-enrollment.controller';
import { RoleGuard } from './interface/role.guard';
import { StepUpGuard } from './interface/step-up.guard';

@Module({
  controllers: [MfaEnrollmentController],
  providers: [
    // Env injecté (cf. NodeCryptoTotpSecretEncrypter qui en a besoin
    // pour MFA_KEK_BASE64).
    { provide: ENV_TOKEN, useValue: env },

    // Use cases (Phase 3 — feature 005)
    EnrollTotpUseCase,

    // Session Auth.js (livré par 001)
    { provide: AUTH_SESSION_READER, useClass: PrismaAuthSessionReader },

    // 9 ports MFA (Phase 2 de 005)
    { provide: MFA_SECRET_REPOSITORY, useClass: PrismaMfaSecretRepository },
    { provide: BACKUP_CODE_REPOSITORY, useClass: PrismaBackupCodeRepository },
    { provide: MFA_AUDIT_WRITER, useClass: PrismaMfaAuditWriter },
    { provide: ACTIVE_SESSION_REVOKER, useClass: PrismaActiveSessionRevoker },
    { provide: TOTP_SECRET_ENCRYPTER, useClass: NodeCryptoTotpSecretEncrypter },
    { provide: BACKUP_CODE_HASHER, useClass: BcryptBackupCodeHasher },
    { provide: TOTP_VALIDATOR, useClass: OtplibTotpValidator },
    { provide: MFA_NOTIFICATION_MAILER, useClass: SesMfaNotificationMailer },
    { provide: MFA_RATE_LIMITER, useClass: PostgresMfaRateLimiter },

    // Guards
    AuthGuard,
    RoleGuard,
    StepUpGuard,
  ],
  exports: [
    AUTH_SESSION_READER,
    MFA_SECRET_REPOSITORY,
    BACKUP_CODE_REPOSITORY,
    MFA_AUDIT_WRITER,
    ACTIVE_SESSION_REVOKER,
    TOTP_SECRET_ENCRYPTER,
    BACKUP_CODE_HASHER,
    TOTP_VALIDATOR,
    MFA_NOTIFICATION_MAILER,
    MFA_RATE_LIMITER,
    AuthGuard,
    RoleGuard,
    StepUpGuard,
  ],
})
export class IdentiteModule {}
