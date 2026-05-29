// T024 + T025d + T057 — IntakeModule.
//
// Wiring DI complet :
//   - Controllers (interface) : VoyageurIntakeController
//   - Use cases (application) : SubmitBriefUseCase + VerifyMagicLinkUseCase
//   - Adapters (infrastructure) :
//       PrismaVoyageurBriefRepository → VoyageurBriefReader+Writer
//       PrismaVoyageurContactRepository → VoyageurContactReader+Writer
//       PrismaMagicLinkTokenRepository → MagicLinkTokenWriter
//       SesMagicLinkMailer → MagicLinkMailer
//       DisposableEmailCheckerImpl → DisposableEmailChecker
//       RedisIntakeRateLimiter → IntakeRateLimiter
//       PrismaIntakeAuditLogWriter → IntakeAuditLogWriter
//       PrismaIntakeOutboxWriter → IntakeOutboxWriter
//   - Cross-cutting : RollingSessionCookieInterceptor (APP_INTERCEPTOR
//     scoped module, FR-014a Q5)
//   - Communs : Clock + UuidGenerator (réutilisés de common/)
//
// Pattern hérité de packages/api/src/modules/conformite/interface/conformite.module.ts.

import { CONFORMITE_QUERY_PORT } from '@cv/shared/conformite';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CryptoUuidGenerator } from '../../common/infrastructure/crypto-uuid-generator';
import { SystemClock } from '../../common/infrastructure/system-clock';
import { CLOCK } from '../../common/ports/clock.port';
import { UUID_GENERATOR } from '../../common/ports/uuid-generator.port';
import { env } from '../../env';
import { BullMqModule } from '../../queue/bullmq.module';
import { ConformiteModule } from '../conformite/interface/conformite.module';
import { IdentiteModule } from '../identite/identite.module';
import {
  DISPOSABLE_EMAIL_CHECKER,
  INTAKE_AUDIT_LOG_WRITER,
  INTAKE_OUTBOX_WRITER,
  INTAKE_RATE_LIMITER,
  MAGIC_LINK_MAILER,
  MAGIC_LINK_TOKEN_WRITER,
  VOYAGEUR_BRIEF_READER,
  VOYAGEUR_BRIEF_WRITER,
  VOYAGEUR_CONTACT_READER,
  VOYAGEUR_CONTACT_WRITER,
} from './application/ports';
import { EraseAllVoyageurDataUseCase } from './application/use-cases/erase-all-voyageur-data.use-case';
import { ListBriefsByEmailUseCase } from './application/use-cases/list-briefs-by-email.use-case';
import { ListUnmatchedBriefsUseCase } from './application/use-cases/list-unmatched-briefs.use-case';
import { PushBriefToConseillerUseCase } from './application/use-cases/push-brief-to-conseiller.use-case';
import { RequestBriefErasureUseCase } from './application/use-cases/request-brief-erasure.use-case';
import { ResendMagicLinkUseCase } from './application/use-cases/resend-magic-link.use-case';
import { SubmitBriefUseCase } from './application/use-cases/submit-brief.use-case';
import { VerifyMagicLinkUseCase } from './application/use-cases/verify-magic-link.use-case';
import { ViewBriefStatusUseCase } from './application/use-cases/view-brief-status.use-case';
import { DisposableEmailCheckerImpl } from './infrastructure/disposable-email-checker';
import { IntakeBriefExpirationSweepJob } from './infrastructure/jobs/intake-brief-expiration-sweep.job';
import { IntakeDisposableEmailsRefreshJob } from './infrastructure/jobs/intake-disposable-emails-refresh.job';
import { IntakeExpirationReminderJob } from './infrastructure/jobs/intake-expiration-reminder.job';
import { IntakeMagicLinkRetryJob } from './infrastructure/jobs/intake-magic-link-retry.job';
import { PrismaIntakeAuditLogWriter } from './infrastructure/prisma-intake-audit-log-writer';
import { PrismaIntakeOutboxWriter } from './infrastructure/prisma-intake-outbox-writer';
import { PrismaMagicLinkTokenRepository } from './infrastructure/prisma-magic-link-token-repository';
import { PrismaVoyageurBriefRepository } from './infrastructure/prisma-voyageur-brief-repository';
import { PrismaVoyageurContactRepository } from './infrastructure/prisma-voyageur-contact-repository';
import { RedisIntakeRateLimiter } from './infrastructure/redis-intake-rate-limiter';
import { SesMagicLinkMailer } from './infrastructure/ses-magic-link-mailer';
import { AdminIntakeController } from './interface/http/admin-intake.controller';
import { IntakeAuthGuard } from './interface/http/intake-auth.guard';
import { RollingSessionCookieInterceptor } from './interface/http/rolling-session-cookie.interceptor';
import { VoyageurIntakeController } from './interface/http/voyageur-intake.controller';

@Module({
  imports: [
    BullMqModule, // expose REDIS_CLIENT pour RedisIntakeRateLimiter + DisposableEmailCheckerImpl
    IdentiteModule, // expose AuthGuard + AUTH_SESSION_READER pour admin endpoints US5
    ConformiteModule, // expose CONFORMITE_QUERY_PORT pour push manuel US5 FR-027
  ],
  controllers: [VoyageurIntakeController, AdminIntakeController],
  providers: [
    // ---------------------------------------------------------------
    // Cross-cutting (Principe V — scoped au module intake)
    // ---------------------------------------------------------------
    { provide: APP_INTERCEPTOR, useClass: RollingSessionCookieInterceptor },

    // ---------------------------------------------------------------
    // Communs — Clock + UuidGenerator (singleton dans tout le module)
    // ---------------------------------------------------------------
    { provide: CLOCK, useClass: SystemClock },
    { provide: UUID_GENERATOR, useClass: CryptoUuidGenerator },

    // ---------------------------------------------------------------
    // Adapters → ports (DI inversion)
    // ---------------------------------------------------------------
    PrismaVoyageurBriefRepository,
    { provide: VOYAGEUR_BRIEF_READER, useExisting: PrismaVoyageurBriefRepository },
    { provide: VOYAGEUR_BRIEF_WRITER, useExisting: PrismaVoyageurBriefRepository },

    PrismaVoyageurContactRepository,
    { provide: VOYAGEUR_CONTACT_READER, useExisting: PrismaVoyageurContactRepository },
    { provide: VOYAGEUR_CONTACT_WRITER, useExisting: PrismaVoyageurContactRepository },

    PrismaMagicLinkTokenRepository,
    { provide: MAGIC_LINK_TOKEN_WRITER, useExisting: PrismaMagicLinkTokenRepository },

    SesMagicLinkMailer,
    { provide: MAGIC_LINK_MAILER, useExisting: SesMagicLinkMailer },

    DisposableEmailCheckerImpl,
    { provide: DISPOSABLE_EMAIL_CHECKER, useExisting: DisposableEmailCheckerImpl },

    RedisIntakeRateLimiter,
    { provide: INTAKE_RATE_LIMITER, useExisting: RedisIntakeRateLimiter },

    PrismaIntakeAuditLogWriter,
    { provide: INTAKE_AUDIT_LOG_WRITER, useExisting: PrismaIntakeAuditLogWriter },

    PrismaIntakeOutboxWriter,
    { provide: INTAKE_OUTBOX_WRITER, useExisting: PrismaIntakeOutboxWriter },

    // ---------------------------------------------------------------
    // Use cases — DI via factory pour assembler les SubmitBriefDeps /
    // VerifyMagicLinkDeps depuis les ports déjà résolus.
    // ---------------------------------------------------------------
    {
      provide: SubmitBriefUseCase.DEPS_TOKEN,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        VOYAGEUR_CONTACT_READER,
        VOYAGEUR_CONTACT_WRITER,
        VOYAGEUR_BRIEF_READER,
        VOYAGEUR_BRIEF_WRITER,
        MAGIC_LINK_TOKEN_WRITER,
        MAGIC_LINK_MAILER,
        DISPOSABLE_EMAIL_CHECKER,
        INTAKE_RATE_LIMITER,
        INTAKE_AUDIT_LOG_WRITER,
        INTAKE_OUTBOX_WRITER,
      ],
      useFactory: (
        clock,
        uuid,
        contactReader,
        contactWriter,
        briefReader,
        briefWriter,
        tokenWriter,
        mailer,
        disposableEmailChecker,
        rateLimiter,
        audit,
        outbox,
      ) => ({
        clock,
        uuid,
        contactReader,
        contactWriter,
        briefReader,
        briefWriter,
        tokenWriter,
        mailer,
        disposableEmailChecker,
        rateLimiter,
        audit,
        outbox,
        magicLinkSecret: env.INTAKE_MAGIC_LINK_SECRET,
        expirationDays: env.INTAKE_BRIEF_EXPIRATION_DAYS,
        magicLinkTtlDays: 7,
      }),
    },
    SubmitBriefUseCase,

    {
      provide: VerifyMagicLinkUseCase.DEPS_TOKEN,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        VOYAGEUR_BRIEF_READER,
        VOYAGEUR_BRIEF_WRITER,
        MAGIC_LINK_TOKEN_WRITER,
        INTAKE_AUDIT_LOG_WRITER,
        INTAKE_OUTBOX_WRITER,
      ],
      useFactory: (clock, uuid, briefReader, briefWriter, tokenWriter, audit, outbox) => ({
        clock,
        uuid,
        briefReader,
        briefWriter,
        tokenWriter,
        audit,
        outbox,
      }),
    },
    VerifyMagicLinkUseCase,

    // ---------------------------------------------------------------
    // Use cases US2 (Phase 4)
    // ---------------------------------------------------------------
    IntakeAuthGuard,
    {
      provide: ViewBriefStatusUseCase.DEPS_TOKEN,
      inject: [VOYAGEUR_BRIEF_READER],
      useFactory: (briefReader) => ({ briefReader }),
    },
    ViewBriefStatusUseCase,

    {
      provide: ListBriefsByEmailUseCase.DEPS_TOKEN,
      inject: [VOYAGEUR_BRIEF_READER, VOYAGEUR_CONTACT_READER],
      useFactory: (briefReader, contactReader) => ({ briefReader, contactReader }),
    },
    ListBriefsByEmailUseCase,

    {
      provide: ResendMagicLinkUseCase.DEPS_TOKEN,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        VOYAGEUR_BRIEF_READER,
        VOYAGEUR_CONTACT_READER,
        MAGIC_LINK_TOKEN_WRITER,
        MAGIC_LINK_MAILER,
      ],
      useFactory: (clock, uuid, briefReader, contactReader, tokenWriter, mailer) => ({
        clock,
        uuid,
        briefReader,
        contactReader,
        tokenWriter,
        mailer,
        magicLinkTtlDays: 7,
      }),
    },
    ResendMagicLinkUseCase,

    // ---------------------------------------------------------------
    // Use cases US4 erasure Loi 25 (Phase 6)
    // ---------------------------------------------------------------
    {
      provide: RequestBriefErasureUseCase.DEPS_TOKEN,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        VOYAGEUR_BRIEF_READER,
        VOYAGEUR_BRIEF_WRITER,
        INTAKE_AUDIT_LOG_WRITER,
        INTAKE_OUTBOX_WRITER,
      ],
      useFactory: (clock, uuid, briefReader, briefWriter, audit, outbox) => ({
        clock,
        uuid,
        briefReader,
        briefWriter,
        audit,
        outbox,
      }),
    },
    RequestBriefErasureUseCase,

    {
      provide: EraseAllVoyageurDataUseCase.DEPS_TOKEN,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        VOYAGEUR_CONTACT_READER,
        VOYAGEUR_CONTACT_WRITER,
        VOYAGEUR_BRIEF_READER,
        VOYAGEUR_BRIEF_WRITER,
        INTAKE_AUDIT_LOG_WRITER,
        INTAKE_OUTBOX_WRITER,
      ],
      useFactory: (
        clock,
        uuid,
        contactReader,
        contactWriter,
        briefReader,
        briefWriter,
        audit,
        outbox,
      ) => ({
        clock,
        uuid,
        contactReader,
        contactWriter,
        briefReader,
        briefWriter,
        audit,
        outbox,
      }),
    },
    EraseAllVoyageurDataUseCase,

    // ---------------------------------------------------------------
    // Use cases US5 admin (Phase 7)
    // ---------------------------------------------------------------
    {
      provide: ListUnmatchedBriefsUseCase.DEPS_TOKEN,
      inject: [CLOCK, VOYAGEUR_BRIEF_READER],
      useFactory: (clock, briefReader) => ({ clock, briefReader }),
    },
    ListUnmatchedBriefsUseCase,

    {
      provide: PushBriefToConseillerUseCase.DEPS_TOKEN,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        VOYAGEUR_BRIEF_READER,
        CONFORMITE_QUERY_PORT,
        INTAKE_AUDIT_LOG_WRITER,
        INTAKE_OUTBOX_WRITER,
      ],
      useFactory: (clock, uuid, briefReader, conformiteQuery, audit, outbox) => ({
        clock,
        uuid,
        briefReader,
        conformiteQuery,
        audit,
        outbox,
      }),
    },
    PushBriefToConseillerUseCase,

    // ---------------------------------------------------------------
    // BullMQ jobs (Phase 5+)
    // ---------------------------------------------------------------
    IntakeDisposableEmailsRefreshJob,
    IntakeBriefExpirationSweepJob,
    IntakeExpirationReminderJob,
    IntakeMagicLinkRetryJob,
  ],
  exports: [],
})
export class IntakeModule {}
