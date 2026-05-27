// Module NestJS identité.
//
// État après merge main → 004 :
//   - Auth conseiller + admin (feature 006/PR #14) : signup, login, verify,
//     logout, reset/change password, admin bootstrap+invitation.
//   - MFA conseiller (feature 005/PR #13) : TOTP enrollment, step-up,
//     verification, admin reset, device change.
//   - Legal (feature 004 en cours) : LegalDocument + LegalAcceptance +
//     LegalAcceptanceAnonymization repositories. Les use cases
//     (AcceptCguB2bUseCase, AcceptIntakeConsentUseCase, etc.) et la façade
//     publique LegalAcceptanceFacade sont ajoutés dans les phases 5-7 + N
//     du plan 004 (T065-T097).

import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { CryptoUuidGenerator } from '../../common/infrastructure/crypto-uuid-generator';
import { SystemClock } from '../../common/infrastructure/system-clock';
import { CLOCK } from '../../common/ports/clock.port';
import { UUID_GENERATOR } from '../../common/ports/uuid-generator.port';
import { env } from '../../env';
import { ConformiteModule } from '../conformite/interface/conformite.module';
import { ACTIVE_SESSION_REVOKER } from './application/ports/active-session-revoker.port';
import { ADMIN_INVITATION_TOKEN_REPOSITORY } from './application/ports/admin-invitation-token-repository.port';
import { AUTH_AUDIT_WRITER } from './application/ports/auth-audit-writer.port';
import { AUTH_OUTBOX_WRITER } from './application/ports/auth-outbox-writer.port';
import { AUTH_SESSION_READER } from './application/ports/auth-session-reader.port';
import { BACKUP_CODE_HASHER } from './application/ports/backup-code-hasher.port';
import { BACKUP_CODE_REPOSITORY } from './application/ports/backup-code-repository.port';
import { CREDENTIAL_ACCOUNT_REPOSITORY } from './application/ports/credential-account-repository.port';
import { EMAIL_VERIFICATION_TOKEN_REPOSITORY } from './application/ports/email-verification-token-repository.port';
import { LEGAL_ACCEPTANCE_ANONYMIZATION_WRITER } from './application/ports/legal-acceptance-anonymization-writer.port';
import { LEGAL_ACCEPTANCE_READER } from './application/ports/legal-acceptance-reader.port';
import { LEGAL_ACCEPTANCE_WRITER } from './application/ports/legal-acceptance-writer.port';
import { LEGAL_DOCUMENT_REPOSITORY } from './application/ports/legal-document-repository.port';
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
import { AcceptCguB2bUseCase } from './application/use-cases/accept-cgu-b2b.use-case';
import { AcceptIntakeConsentUseCase } from './application/use-cases/accept-intake-consent.use-case';
import { AnonymizeLegalAcceptancesUseCase } from './application/use-cases/anonymize-legal-acceptances.use-case';
import { BootstrapAdminUseCase } from './application/use-cases/bootstrap-admin.use-case';
import { ChangeDeviceUseCase } from './application/use-cases/change-device.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { CheckCguUpToDateUseCase } from './application/use-cases/check-cgu-up-to-date.use-case';
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
import { PrismaLegalAcceptanceAnonymizationRepository } from './infrastructure/prisma-legal-acceptance-anonymization-repository';
import { PrismaLegalAcceptanceRepository } from './infrastructure/prisma-legal-acceptance-repository';
import { PrismaLegalDocumentRepository } from './infrastructure/prisma-legal-document-repository';
import { PrismaLoginLockoutRepository } from './infrastructure/prisma-login-lockout-repository';
import { PrismaMfaAuditWriter } from './infrastructure/prisma-mfa-audit-writer';
import { PrismaMfaSecretRepository } from './infrastructure/prisma-mfa-secret-repository';
import { PrismaPasswordResetTokenRepository } from './infrastructure/prisma-password-reset-token-repository';
import { PrismaPasswordVerifier } from './infrastructure/prisma-password-verifier';
import { SesMfaNotificationMailer } from './infrastructure/ses-mfa-notification-mailer';
import { AdminUserInvitationController } from './interface/admin-user-invitation.controller';
import { AuthAdminInvitationController } from './interface/auth-admin-invitation.controller';
import { AuthEmailVerificationController } from './interface/auth-email-verification.controller';
import { AuthLoginController } from './interface/auth-login.controller';
import { AuthLogoutController } from './interface/auth-logout.controller';
import { AuthPasswordChangeController } from './interface/auth-password-change.controller';
import { AuthPasswordResetController } from './interface/auth-password-reset.controller';
import { AuthSignupController } from './interface/auth-signup.controller';
import { AuthGuard } from './interface/auth.guard';
import { LegalAcceptanceController } from './interface/legal-acceptance.controller';
import { LegalPublicController } from './interface/legal-public.controller';
import { MfaAdminResetController } from './interface/mfa-admin-reset.controller';
import { MfaDeviceChangeController } from './interface/mfa-device-change.controller';
import { MfaEnrollmentController } from './interface/mfa-enrollment.controller';
import { MfaStepUpController } from './interface/mfa-step-up.controller';
import { MfaVerificationController } from './interface/mfa-verification.controller';
import { LegalAcceptanceFacade } from './interface/public-api/legal-acceptance.facade';
import { RoleGuard } from './interface/role.guard';
import { StepUpGuard } from './interface/step-up.guard';

import { ConformiteStatusChangedListener } from './application/listeners/conformite-status-changed.listener';
import { ProfilCacheInvalidator } from './application/listeners/profil-cache-invalidation.listener';
// Feature 007 (profil conseiller) — ports + adaptateurs
import { AUTH_USER_LEGAL_NAME_READER } from './application/ports/auth-user-legal-name-reader.port';
import { CLOUDFRONT_CACHE_INVALIDATOR } from './application/ports/cloudfront-cache-invalidator.port';
import { EST_PROFIL_PUBLIC_PORT } from './application/ports/est-profil-public.port';
import { NEXTJS_REVALIDATOR } from './application/ports/nextjs-revalidator.port';
import { ONBOARDING_RELANCE_SCHEDULER } from './application/ports/onboarding-relance-scheduler.port';
import { PHOTO_HISTORIQUE_REPOSITORY } from './application/ports/photo-historique-repository.port';
import { PHOTO_STORAGE } from './application/ports/photo-storage.port';
import { PROFIL_CONSEILLER_REPOSITORY } from './application/ports/profil-conseiller-repository.port';
import { PROFIL_MODERATION_AUDIT_WRITER } from './application/ports/profil-moderation-audit-writer.port';
import { PROFIL_PUBLIC_READER } from './application/ports/profil-public-reader.port';
import { SLUG_RESERVATION_REPOSITORY } from './application/ports/slug-reservation-repository.port';
import { AnonymiserProfilLoi25UseCase } from './application/use-cases/anonymiser-profil-loi25.use-case';
import { EditerProfilUseCase } from './application/use-cases/editer-profil.use-case';
import { EnvoyerRelanceOnboardingUseCase } from './application/use-cases/envoyer-relance-onboarding.use-case';
import { LirePageProfilPubliqueUseCase } from './application/use-cases/lire-page-profil-publique.use-case';
import { LireProfilPriveUseCase } from './application/use-cases/lire-profil-prive.use-case';
import { MasquerProfilAdminUseCase } from './application/use-cases/masquer-profil-admin.use-case';
import { PrevisualiserProfilUseCase } from './application/use-cases/previsualiser-profil.use-case';
import { RetablirProfilAdminUseCase } from './application/use-cases/retablir-profil-admin.use-case';
import { RetirerPhotoAdminUseCase } from './application/use-cases/retirer-photo-admin.use-case';
import { UploaderPhotoUseCase } from './application/use-cases/uploader-photo.use-case';
import { BullmqOnboardingRelanceScheduler } from './infrastructure/bullmq-onboarding-relance-scheduler';
import { AwsCloudFrontCacheInvalidator } from './infrastructure/cloudfront-cache-invalidator';
import { HttpNextjsRevalidator } from './infrastructure/http-nextjs-revalidator';
import { CleanupOrphanPhotosJob } from './infrastructure/jobs/cleanup-orphan-photos.job';
import { PrismaAuthUserLegalNameReader } from './infrastructure/prisma-auth-user-legal-name-reader';
import { PrismaEstProfilPublic } from './infrastructure/prisma-est-profil-public';
import { PrismaPhotoHistoriqueRepository } from './infrastructure/prisma-photo-historique-repository';
import { PrismaProfilConseillerRepository } from './infrastructure/prisma-profil-conseiller-repository';
import { PrismaProfilModerationAuditWriter } from './infrastructure/prisma-profil-moderation-audit-writer';
import { PrismaProfilPublicReader } from './infrastructure/prisma-profil-public-reader';
import { PrismaSlugReservationRepository } from './infrastructure/prisma-slug-reservation-repository';
import { S3PhotoStorage } from './infrastructure/s3-photo-storage';
import { ProfilAdminController } from './interface/profil-admin.controller';
import { ProfilConseillerController } from './interface/profil-conseiller.controller';
import { ProfilInternalController } from './interface/profil-internal.controller';
import { ProfilPublicController } from './interface/profil-public.controller';

@Module({
  imports: [
    // Cycle ConformiteModule ↔ IdentiteModule : conformité importe identité
    // pour AuthGuard, et identité importe conformité (feature 007) pour
    // CONFORMITE_QUERY_PORT. forwardRef() résout le cycle d'initialisation
    // NestJS sans casser le DI.
    forwardRef(() => ConformiteModule),
    // BullMQ queue pour les relances onboarding (feature 007, T041).
    BullModule.registerQueue({ name: 'identite.onboarding-reminders' }),
  ],
  controllers: [
    // Auth (feature 006)
    AuthSignupController,
    AuthLoginController,
    AuthEmailVerificationController,
    AuthLogoutController,
    AuthPasswordResetController,
    AuthPasswordChangeController,
    AdminUserInvitationController,
    AuthAdminInvitationController,
    // MFA (feature 005)
    MfaEnrollmentController,
    MfaStepUpController,
    MfaVerificationController,
    MfaAdminResetController,
    MfaDeviceChangeController,
    // Legal (feature 004 US3)
    LegalAcceptanceController,
    LegalPublicController,
    // Profil conseiller (feature 007 US1)
    ProfilConseillerController,
    // Profil public (feature 007 US2)
    ProfilPublicController,
    // Profil admin modération (feature 007 US6)
    ProfilAdminController,
    // Profil interne (feature 007 US5 — orchestré par 023)
    ProfilInternalController,
  ],
  providers: [
    // Env injecté (cf. NodeCryptoTotpSecretEncrypter qui en a besoin
    // pour MFA_KEK_BASE64 ; JoseTokenIssuer pour AUTH_TOKEN_SECRET).
    { provide: ENV_TOKEN, useValue: env },

    // Use cases MFA (Phase 3+ — feature 005)
    EnrollTotpUseCase,
    StepUpUseCase,
    VerifyTotpUseCase,
    VerifyBackupCodeUseCase,
    ResetMfaAdminUseCase,
    CountActiveAdminsUseCase,
    ChangeDeviceUseCase,
    RegenerateBackupCodesUseCase,

    // Use cases — feature 004 (legal acceptances)
    AcceptCguB2bUseCase,
    AcceptIntakeConsentUseCase,
    AnonymizeLegalAcceptancesUseCase,
    CheckCguUpToDateUseCase,

    // Public API facade (consommée par 002-voyageur-intake — US4)
    LegalAcceptanceFacade,

    // Common (Clock + UuidGenerator partagés)
    { provide: CLOCK, useClass: SystemClock },
    { provide: UUID_GENERATOR, useClass: CryptoUuidGenerator },

    // Use cases — feature 006 (auth conseiller + admin)
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

    // Password verifier — feature 006 Phase 4 : PrismaPasswordVerifier
    // remplace StubPasswordVerifier (résout bug_007 du review 002a).
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

    // Ports feature 006 (Phase 2)
    { provide: CREDENTIAL_ACCOUNT_REPOSITORY, useClass: PrismaCredentialAccountRepository },
    {
      provide: EMAIL_VERIFICATION_TOKEN_REPOSITORY,
      useClass: PrismaEmailVerificationTokenRepository,
    },
    { provide: AUTH_AUDIT_WRITER, useClass: PrismaAuthAuditWriter },
    { provide: AUTH_OUTBOX_WRITER, useClass: PrismaAuthOutboxWriter },
    { provide: TOKEN_ISSUER, useClass: JoseTokenIssuer },
    { provide: LOGIN_LOCKOUT_REPOSITORY, useClass: PrismaLoginLockoutRepository },
    { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useClass: PrismaPasswordResetTokenRepository },
    { provide: ADMIN_INVITATION_TOKEN_REPOSITORY, useClass: PrismaAdminInvitationTokenRepository },

    // Legal (T034-T036 + T041 feature 004)
    // PrismaLegalAcceptanceRepository implémente Reader + Writer — on
    // l'enregistre une fois puis alias les deux symboles via useExisting
    // (sinon Nest crée deux instances distinctes du même repository).
    PrismaLegalAcceptanceRepository,
    { provide: LEGAL_ACCEPTANCE_READER, useExisting: PrismaLegalAcceptanceRepository },
    { provide: LEGAL_ACCEPTANCE_WRITER, useExisting: PrismaLegalAcceptanceRepository },
    { provide: LEGAL_DOCUMENT_REPOSITORY, useClass: PrismaLegalDocumentRepository },
    {
      provide: LEGAL_ACCEPTANCE_ANONYMIZATION_WRITER,
      useClass: PrismaLegalAcceptanceAnonymizationRepository,
    },

    // --- Feature 007 (profil conseiller) — use cases ---
    LireProfilPriveUseCase,
    LirePageProfilPubliqueUseCase,
    PrevisualiserProfilUseCase,
    EditerProfilUseCase,
    UploaderPhotoUseCase,
    RetirerPhotoAdminUseCase,
    MasquerProfilAdminUseCase,
    RetablirProfilAdminUseCase,
    AnonymiserProfilLoi25UseCase,
    EnvoyerRelanceOnboardingUseCase,
    CleanupOrphanPhotosJob,

    // --- Feature 007 — listener cross-module (ConformiteStatusChanged) ---
    ConformiteStatusChangedListener,

    // --- Feature 007 — ports → adapters ---
    { provide: PROFIL_CONSEILLER_REPOSITORY, useClass: PrismaProfilConseillerRepository },
    { provide: PHOTO_HISTORIQUE_REPOSITORY, useClass: PrismaPhotoHistoriqueRepository },
    { provide: SLUG_RESERVATION_REPOSITORY, useClass: PrismaSlugReservationRepository },
    { provide: PHOTO_STORAGE, useClass: S3PhotoStorage },
    { provide: CLOUDFRONT_CACHE_INVALIDATOR, useClass: AwsCloudFrontCacheInvalidator },
    { provide: ONBOARDING_RELANCE_SCHEDULER, useClass: BullmqOnboardingRelanceScheduler },
    { provide: NEXTJS_REVALIDATOR, useClass: HttpNextjsRevalidator },
    ProfilCacheInvalidator,
    { provide: PROFIL_MODERATION_AUDIT_WRITER, useClass: PrismaProfilModerationAuditWriter },
    { provide: AUTH_USER_LEGAL_NAME_READER, useClass: PrismaAuthUserLegalNameReader },
    { provide: PROFIL_PUBLIC_READER, useClass: PrismaProfilPublicReader },
    { provide: EST_PROFIL_PUBLIC_PORT, useClass: PrismaEstProfilPublic },

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
    // Legal — consommé par les use cases d'identité côté 004 et par
    // 002-voyageur-intake via la façade LegalAcceptanceFacade.
    LEGAL_ACCEPTANCE_READER,
    LEGAL_ACCEPTANCE_WRITER,
    LEGAL_DOCUMENT_REPOSITORY,
    LEGAL_ACCEPTANCE_ANONYMIZATION_WRITER,
    LegalAcceptanceFacade,
    // Feature 007 (profil conseiller) — exports vers modules futurs.
    // EST_PROFIL_PUBLIC_PORT est l'interface stable consommée par les
    // modules matching (011) et SEO (016) via @cv/shared/profil-public.
    EST_PROFIL_PUBLIC_PORT,
    // Les autres ports profil sont internes au module — non exportés.
  ],
})
export class IdentiteModule {}
