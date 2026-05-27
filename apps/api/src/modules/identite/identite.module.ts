// Module NestJS identité.
//
// Phase 2 de feature 005 (MFA) — wiring de tous les ports MFA + guards.
// Les use cases et contrôleurs HTTP MFA arrivent en Phase 3 (US1)
// et au-delà.
// Feature 003 : AuthOutboxDispatchWorker + MfaOutboxDispatchWorker branchés.

import { Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { env } from '../../env';
import { NotificationsModule } from '../notifications/interface/notifications.module';
import { ACTIVE_SESSION_REVOKER } from './application/ports/active-session-revoker.port';
import { ADMIN_INVITATION_TOKEN_REPOSITORY } from './application/ports/admin-invitation-token-repository.port';
import { AUTH_AUDIT_WRITER } from './application/ports/auth-audit-writer.port';
import { AUTH_OUTBOX_WRITER } from './application/ports/auth-outbox-writer.port';
import { AUTH_SESSION_READER } from './application/ports/auth-session-reader.port';
import { BACKUP_CODE_HASHER } from './application/ports/backup-code-hasher.port';
import { BACKUP_CODE_REPOSITORY } from './application/ports/backup-code-repository.port';
import { CREDENTIAL_ACCOUNT_REPOSITORY } from './application/ports/credential-account-repository.port';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from './application/ports/email-verification-token-repository.port';
import { LOGIN_LOCKOUT_REPOSITORY } from './application/ports/login-lockout-repository.port';
import { MFA_AUDIT_WRITER } from './application/ports/mfa-audit-writer.port';
import { MFA_NOTIFICATION_MAILER } from './application/ports/mfa-notification-mailer.port';
import { MFA_RATE_LIMITER } from './application/ports/mfa-rate-limiter.port';
import { MFA_SECRET_REPOSITORY } from './application/ports/mfa-secret-repository.port';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from './application/ports/password-reset-token-repository.port';
import { PASSWORD_VERIFIER } from './application/ports/password-verifier.port';
import { TOKEN_ISSUER } from './application/ports/token-issuer.port';
import { TOTP_SECRET_ENCRYPTER } from './application/ports/totp-secret-encrypter.port';
import { TOTP_VALIDATOR } from './application/ports/totp-validator.port';
import { BootstrapAdminUseCase } from './application/use-cases/bootstrap-admin.use-case';
import { ChangeDeviceUseCase } from './application/use-cases/change-device.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { CompletePasswordResetUseCase } from './application/use-cases/complete-password-reset.use-case';
import { ConsumeAdminInvitationUseCase } from './application/use-cases/consume-admin-invitation.use-case';
import { CountActiveAdminsUseCase } from './application/use-cases/count-active-admins.use-case';
import { EnrollTotpUseCase } from './application/use-cases/enroll-totp.use-case';
import { InviteAdminUseCase } from './application/use-cases/invite-admin.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { RegenerateBackupCodesUseCase } from './application/use-cases/regenerate-backup-codes.use-case';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ResendEmailVerificationUseCase } from './application/use-cases/resend-email-verification.use-case';
import { ResetMfaAdminUseCase } from './application/use-cases/reset-mfa-admin.use-case';
import { SignupConseillerUseCase } from './application/use-cases/signup-conseiller.use-case';
import { StepUpUseCase } from './application/use-cases/step-up.use-case';
import { ValidateAdminInvitationUseCase } from './application/use-cases/validate-admin-invitation.use-case';
import { VerifyBackupCodeUseCase } from './application/use-cases/verify-backup-code.use-case';
import { VerifyEmailUseCase } from './application/use-cases/verify-email.use-case';
import { VerifyTotpUseCase } from './application/use-cases/verify-totp.use-case';
import { BcryptBackupCodeHasher } from './infrastructure/bcrypt-backup-code-hasher';
import { AuthOutboxDispatchWorker } from './infrastructure/jobs/auth-outbox-dispatch.worker';
import { MfaOutboxDispatchWorker } from './infrastructure/jobs/mfa-outbox-dispatch.worker';
import { JoseTokenIssuer } from './infrastructure/jose-token-issuer';
import {
  ENV_TOKEN,
  NodeCryptoTotpSecretEncrypter,
} from './infrastructure/node-crypto-totp-secret-encrypter';
import { OtplibTotpValidator } from './infrastructure/otplib-totp-validator';
import { PostgresMfaRateLimiter } from './infrastructure/postgres-mfa-rate-limiter';
import { PrismaActiveSessionRevoker } from './infrastructure/prisma-active-session-revoker';
import { PrismaAdminInvitationTokenRepository } from './infrastructure/prisma-admin-invitation-token-repository';
import { PrismaAuthAuditWriter } from './infrastructure/prisma-auth-audit-writer';
import { PrismaAuthOutboxWriter } from './infrastructure/prisma-auth-outbox-writer';
import { PrismaAuthSessionReader } from './infrastructure/prisma-auth-session-reader';
import { PrismaBackupCodeRepository } from './infrastructure/prisma-backup-code-repository';
import { PrismaCredentialAccountRepository } from './infrastructure/prisma-credential-account-repository';
import { PrismaEmailVerificationTokenRepository } from './infrastructure/prisma-email-verification-token-repository';
import { PrismaLoginLockoutRepository } from './infrastructure/prisma-login-lockout-repository';
import { PrismaMfaAuditWriter } from './infrastructure/prisma-mfa-audit-writer';
import { PrismaMfaSecretRepository } from './infrastructure/prisma-mfa-secret-repository';
import { PrismaPasswordResetTokenRepository } from './infrastructure/prisma-password-reset-token-repository';
import { PrismaPasswordVerifier } from './infrastructure/prisma-password-verifier';
import { SesMfaNotificationMailer } from './infrastructure/ses-mfa-notification-mailer';
import { AdminUserInvitationController } from './interface/admin-user-invitation.controller';
import { AuthAdminInvitationController } from './interface/auth-admin-invitation.controller';
// StubPasswordVerifier reste disponible pour les tests d'intégration
// MFA US6 (overrideProvider). Import retiré du module — il est wiré
// uniquement par les test files qui en ont besoin.
import { AuthEmailVerificationController } from './interface/auth-email-verification.controller';
import { AuthLoginController } from './interface/auth-login.controller';
import { AuthLogoutController } from './interface/auth-logout.controller';
import { AuthPasswordChangeController } from './interface/auth-password-change.controller';
import { AuthPasswordResetController } from './interface/auth-password-reset.controller';
import { AuthSignupController } from './interface/auth-signup.controller';
import { AuthGuard } from './interface/auth.guard';
import { MfaAdminResetController } from './interface/mfa-admin-reset.controller';
import { MfaDeviceChangeController } from './interface/mfa-device-change.controller';
import { MfaEnrollmentController } from './interface/mfa-enrollment.controller';
import { MfaStepUpController } from './interface/mfa-step-up.controller';
import { MfaVerificationController } from './interface/mfa-verification.controller';
import { RoleGuard } from './interface/role.guard';
import { StepUpGuard } from './interface/step-up.guard';

const OUTBOX_DRAIN_INTERVAL_MS = process.env.NODE_ENV === 'development' ? 30_000 : 5_000;

@Module({
  imports: [NotificationsModule],
  controllers: [
    // Auth (feature 002)
    AuthSignupController,
    AuthLoginController,
    AuthEmailVerificationController,
    AuthLogoutController,
    AuthPasswordResetController,
    AuthPasswordChangeController,
    AdminUserInvitationController,
    AuthAdminInvitationController,
    // MFA (feature 002a)
    MfaEnrollmentController,
    MfaStepUpController,
    MfaVerificationController,
    MfaAdminResetController,
    MfaDeviceChangeController,
  ],
  providers: [
    // Env injecté (cf. NodeCryptoTotpSecretEncrypter qui en a besoin
    // pour MFA_KEK_BASE64 ; JoseTokenIssuer pour AUTH_TOKEN_SECRET).
    { provide: ENV_TOKEN, useValue: env },

    // Use cases (Phase 3+ — feature 005)
    EnrollTotpUseCase,
    StepUpUseCase,
    VerifyTotpUseCase,
    VerifyBackupCodeUseCase,
    ResetMfaAdminUseCase,
    CountActiveAdminsUseCase,
    ChangeDeviceUseCase,
    RegenerateBackupCodesUseCase,

    // Use cases — feature 002 (auth conseiller + admin)
    SignupConseillerUseCase,
    LoginUseCase,
    LogoutUseCase,
    VerifyEmailUseCase,
    ResendEmailVerificationUseCase,
    RequestPasswordResetUseCase,
    CompletePasswordResetUseCase,
    ChangePasswordUseCase,
    BootstrapAdminUseCase,
    InviteAdminUseCase,
    ValidateAdminInvitationUseCase,
    ConsumeAdminInvitationUseCase,

    // Password verifier — feature 002 Phase 4 : PrismaPasswordVerifier
    // remplace StubPasswordVerifier (résout bug_007 du review 002a).
    // Le stub reste exporté en infrastructure/ avec son throw
    // NODE_ENV=production (C5 — défense en profondeur) ; il est injecté
    // par les tests d'intégration MFA US6 via overrideProvider().
    { provide: PASSWORD_VERIFIER, useClass: PrismaPasswordVerifier },

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

    // Ports feature 002 (Phase 2 de 006)
    {
      provide: CREDENTIAL_ACCOUNT_REPOSITORY,
      useClass: PrismaCredentialAccountRepository,
    },
    {
      provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY,
      useClass: PrismaEmailVerificationTokenRepository,
    },
    { provide: AUTH_AUDIT_WRITER, useClass: PrismaAuthAuditWriter },
    { provide: AUTH_OUTBOX_WRITER, useClass: PrismaAuthOutboxWriter },
    { provide: TOKEN_ISSUER, useClass: JoseTokenIssuer },
    { provide: LOGIN_LOCKOUT_REPOSITORY, useClass: PrismaLoginLockoutRepository },
    {
      provide: PASSWORD_RESET_TOKEN_REPOSITORY,
      useClass: PrismaPasswordResetTokenRepository,
    },
    {
      provide: ADMIN_INVITATION_TOKEN_REPOSITORY,
      useClass: PrismaAdminInvitationTokenRepository,
    },

    // Guards
    AuthGuard,
    RoleGuard,
    StepUpGuard,

    // Feature 003 — outbox dispatch workers
    AuthOutboxDispatchWorker,
    MfaOutboxDispatchWorker,
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
export class IdentiteModule implements OnModuleInit, OnModuleDestroy {
  private authOutboxInterval?: NodeJS.Timeout;
  private mfaOutboxInterval?: NodeJS.Timeout;

  constructor(
    private readonly authOutboxWorker: AuthOutboxDispatchWorker,
    private readonly mfaOutboxWorker: MfaOutboxDispatchWorker,
  ) {}

  onModuleInit(): void {
    this.authOutboxInterval = setInterval(() => {
      void this.authOutboxWorker.drain();
    }, OUTBOX_DRAIN_INTERVAL_MS);
    this.mfaOutboxInterval = setInterval(() => {
      void this.mfaOutboxWorker.drain();
    }, OUTBOX_DRAIN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.authOutboxInterval) clearInterval(this.authOutboxInterval);
    if (this.mfaOutboxInterval) clearInterval(this.mfaOutboxInterval);
  }
}
