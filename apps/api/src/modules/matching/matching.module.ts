// T063 — MatchingModule (feature 011 — Phase 2/3 wiring complet US1).
//
// Imports cross-module (Principe V — interfaces publiques uniquement) :
//   - BullMqModule : REDIS_CLIENT pour RedisRematchLockAdapter + futur consumer T093
//   - ConformiteModule : CONFORMITE_QUERY_PORT (filtre verified, snapshot reader T059)
//   - IdentiteModule : AuthGuard + RoleGuard + AUTH_SESSION_READER (admin endpoint T081 Phase 5)
//
// Pattern hérité de intake.module.ts (feature 008) :
//   - DI tokens Symbol.for(...) pour chaque port
//   - useFactory + inject pour PerformMatchingUseCase.DEPS_TOKEN
//   - useClass pour les adapters (injection directe DI)

import { CONFORMITE_QUERY_PORT } from '@cv/shared/conformite';
import { MATCHING_LEAD_QUERY_PORT, MATCHING_QUERY_PORT } from '@cv/shared/matching';
import { BullModule } from '@nestjs/bullmq';
import { Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { CryptoUuidGenerator } from '../../common/infrastructure/crypto-uuid-generator';
import { SystemClock } from '../../common/infrastructure/system-clock';
import { CLOCK } from '../../common/ports/clock.port';
import { UUID_GENERATOR } from '../../common/ports/uuid-generator.port';
import { env } from '../../env';
import { BullMqModule } from '../../queue/bullmq.module';
import { ConformiteModule } from '../conformite/interface/conformite.module';
import { IdentiteModule } from '../identite/identite.module';
import {
  ATTACHMENT_STORAGE,
  BRIEF_SNAPSHOT_READER,
  CONSEILLER_IDENTITY_RESOLVER,
  CONSEILLER_SNAPSHOT_READER,
  CONSUMED_EVENT_STORE,
  CONVERSATION_NOTIFICATION_MAILER,
  CONVERSATION_NOTIFICATION_OUTBOX,
  CONVERSATION_OPENER,
  CONVERSATION_REPO,
  FSA_CENTROID_READER,
  LEAD_BRIEF_SUMMARY_READER,
  LEAD_METRICS_RECORDER,
  LEAD_NOTIFICATION_MAILER,
  LEAD_NOTIFICATION_OUTBOX,
  LEAD_READER,
  LEAD_WRITER,
  MATCHING_AUDIT_WRITER,
  MATCHING_EVENT_PUBLISHER,
  MATCHING_METRICS_RECORDER,
  MATCHING_OUTBOX_WRITER,
  MATCHING_RESULT_READER,
  MATCHING_RESULT_WRITER,
  REDIS_REMATCH_LOCK,
} from './application/ports';
import { ConsumeMatchingEventUseCase } from './application/use-cases/consume-matching-event.use-case';
import { CreateAttachmentUploadUseCase } from './application/use-cases/create-attachment-upload.use-case';
import { DetectAllMatchesRevokedUseCase } from './application/use-cases/detect-all-matches-revoked.use-case';
import { FinalizeAttachmentUseCase } from './application/use-cases/finalize-attachment.use-case';
import { GetAttachmentUrlUseCase } from './application/use-cases/get-attachment-url.use-case';
import { ListConversationMessagesUseCase } from './application/use-cases/list-messages.use-case';
import { OpenConversationOnLeadAcceptedUseCase } from './application/use-cases/open-conversation-on-accept.use-case';
import { PerformMatchingUseCase } from './application/use-cases/perform-matching.use-case';
import { QueryMatchingResultUseCase } from './application/use-cases/query-matching-result.use-case';
import { ReconcileLeadsUseCase } from './application/use-cases/reconcile-leads.use-case';
import { RecordLeadTransitionUseCase } from './application/use-cases/record-lead-transition.use-case';
import { SendMessageUseCase } from './application/use-cases/send-message.use-case';
import { TriggerRematchUseCase } from './application/use-cases/trigger-rematch.use-case';
import { ViewLeadUseCase } from './application/use-cases/view-lead.use-case';
import { WeightsConfig } from './domain/value-objects/weights-config.vo';
import { EmbeddedFsaCentroidReader } from './infrastructure/embedded-fsa-centroid-reader';
import { AllMatchesRevokedScheduler } from './infrastructure/jobs/all-matches-revoked.scheduler';
import { BriefActivatedConsumer } from './infrastructure/jobs/brief-activated.consumer';
import {
  CONVERSATION_NOTIFICATIONS_QUEUE,
  ConversationNotificationDispatcher,
  ConversationNotificationSender,
  ConversationNotificationWorker,
} from './infrastructure/jobs/conversation-notification.job';
import {
  LEAD_NOTIFICATIONS_QUEUE,
  LeadNotificationDispatcher,
  LeadNotificationSender,
  LeadNotificationWorker,
} from './infrastructure/jobs/lead-notification.job';
import { LeadReconciliationScheduler } from './infrastructure/jobs/lead-reconciliation.scheduler';
import { MatchingEventsConsumer } from './infrastructure/jobs/matching-events.consumer';
import { MatchingOutboxPublisherJob } from './infrastructure/jobs/matching-outbox-publisher.job';
import { LeadAcceptedConversationOpener } from './infrastructure/lead-accepted-conversation-opener';
import { OtelLeadMetricsRecorder } from './infrastructure/otel-lead-metrics-recorder';
import { OtelMetricsRecorder } from './infrastructure/otel-metrics-recorder';
import { PrismaBriefSnapshotReader } from './infrastructure/prisma-brief-snapshot-reader';
import { PrismaConseillerIdentityResolver } from './infrastructure/prisma-conseiller-identity-resolver';
import { PrismaConseillerSnapshotReader } from './infrastructure/prisma-conseiller-snapshot-reader';
import { PrismaConsumedEventStore } from './infrastructure/prisma-consumed-event-store';
import { PrismaConversationNotificationOutbox } from './infrastructure/prisma-conversation-notification-outbox';
import { PrismaConversationRepository } from './infrastructure/prisma-conversation-repository';
import { PrismaLeadBriefSummaryReader } from './infrastructure/prisma-lead-brief-summary-reader';
import { PrismaLeadNotificationOutbox } from './infrastructure/prisma-lead-notification-outbox';
import { PrismaLeadQueryAdapter } from './infrastructure/prisma-lead-query-adapter';
import { PrismaLeadRepository } from './infrastructure/prisma-lead-repository';
import { PrismaMatchingAuditWriter } from './infrastructure/prisma-matching-audit-writer';
import { PrismaMatchingOutboxWriter } from './infrastructure/prisma-matching-outbox-writer';
import { PrismaMatchingQueryAdapter } from './infrastructure/prisma-matching-query-adapter';
import { PrismaMatchingResultRepository } from './infrastructure/prisma-matching-result-repository';
import { RedisMatchingEventPublisher } from './infrastructure/redis-matching-event-publisher';
import { RedisRematchLockAdapter } from './infrastructure/redis-rematch-lock';
import { S3AttachmentStorage } from './infrastructure/s3-attachment-storage';
import { SesConversationMailer } from './infrastructure/ses-conversation-mailer';
import { SesLeadNotificationMailer } from './infrastructure/ses-lead-notification-mailer';
import { AdminMatchingController } from './interface/http/admin-matching.controller';
import { ConseillerConversationController } from './interface/http/conseiller-conversation.controller';
import { ConseillerLeadController } from './interface/http/conseiller-lead.controller';

/** Intervalle de drain de l'outbox matching (5 s prod, 30 s dev). */
const OUTBOX_DRAIN_INTERVAL_MS = process.env.NODE_ENV === 'development' ? 30_000 : 5_000;

/** Intervalle du sweep de réconciliation des leads (filet bus HS). */
const LEAD_RECONCILE_INTERVAL_MS = process.env.NODE_ENV === 'development' ? 120_000 : 60_000;

@Module({
  imports: [
    BullMqModule,
    IdentiteModule,
    ConformiteModule,
    // Queue notifications conseiller (012) — un job par destinataire.
    BullModule.registerQueue({ name: LEAD_NOTIFICATIONS_QUEUE }),
    // Queue notifications conversation (013) — un job par destinataire.
    BullModule.registerQueue({ name: CONVERSATION_NOTIFICATIONS_QUEUE }),
  ],
  controllers: [
    AdminMatchingController,
    ConseillerLeadController,
    ConseillerConversationController,
  ],
  providers: [
    // ---------------------------------------------------------------
    // Communs — Clock + UuidGenerator (singleton dans tout le module)
    // ---------------------------------------------------------------
    { provide: CLOCK, useClass: SystemClock },
    { provide: UUID_GENERATOR, useClass: CryptoUuidGenerator },

    // ---------------------------------------------------------------
    // Adapters → ports (DI inversion)
    // ---------------------------------------------------------------
    PrismaMatchingResultRepository,
    { provide: MATCHING_RESULT_WRITER, useExisting: PrismaMatchingResultRepository },
    { provide: MATCHING_RESULT_READER, useExisting: PrismaMatchingResultRepository },

    PrismaMatchingAuditWriter,
    { provide: MATCHING_AUDIT_WRITER, useExisting: PrismaMatchingAuditWriter },

    PrismaMatchingOutboxWriter,
    { provide: MATCHING_OUTBOX_WRITER, useExisting: PrismaMatchingOutboxWriter },

    PrismaBriefSnapshotReader,
    { provide: BRIEF_SNAPSHOT_READER, useExisting: PrismaBriefSnapshotReader },

    PrismaConseillerSnapshotReader,
    { provide: CONSEILLER_SNAPSHOT_READER, useExisting: PrismaConseillerSnapshotReader },

    EmbeddedFsaCentroidReader,
    { provide: FSA_CENTROID_READER, useExisting: EmbeddedFsaCentroidReader },

    RedisRematchLockAdapter,
    { provide: REDIS_REMATCH_LOCK, useExisting: RedisRematchLockAdapter },

    OtelMetricsRecorder,
    { provide: MATCHING_METRICS_RECORDER, useExisting: OtelMetricsRecorder },

    // Outbox publisher (T093) — draine matching_outbox_entries vers le bus
    // Redis (consommable par 012). Scheduling via OnModuleInit ci-dessous.
    RedisMatchingEventPublisher,
    { provide: MATCHING_EVENT_PUBLISHER, useExisting: RedisMatchingEventPublisher },
    MatchingOutboxPublisherJob,

    // ---------------------------------------------------------------
    // WeightsConfig — singleton lu depuis env vars MATCHING_WEIGHT_*
    // (T003 + ADR-0020). Validé au boot par superRefine Zod côté env.ts
    // + invariant WeightsConfig.create.
    // ---------------------------------------------------------------
    {
      provide: WeightsConfig,
      useFactory: () =>
        WeightsConfig.create({
          destination: env.MATCHING_WEIGHT_DESTINATION,
          geo: env.MATCHING_WEIGHT_GEO,
          speciality: env.MATCHING_WEIGHT_SPECIALITY,
          familiarity: env.MATCHING_WEIGHT_FAMILIARITY,
        }),
    },

    // ---------------------------------------------------------------
    // Use case — DI via factory pour assembler PerformMatchingDeps
    // ---------------------------------------------------------------
    {
      provide: PerformMatchingUseCase.DEPS_TOKEN,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        BRIEF_SNAPSHOT_READER,
        CONSEILLER_SNAPSHOT_READER,
        FSA_CENTROID_READER,
        MATCHING_RESULT_WRITER,
        MATCHING_AUDIT_WRITER,
        MATCHING_OUTBOX_WRITER,
        WeightsConfig,
        MATCHING_METRICS_RECORDER,
      ],
      useFactory: (
        clock,
        uuid,
        briefReader,
        conseillerReader,
        fsaReader,
        resultWriter,
        auditWriter,
        outboxWriter,
        weights,
        metrics,
      ) => ({
        clock,
        uuid,
        briefReader,
        conseillerReader,
        fsaReader,
        resultWriter,
        auditWriter,
        outboxWriter,
        weights,
        metrics,
        algorithmVersion: env.MATCHING_ALGORITHM_VERSION,
      }),
    },
    {
      provide: PerformMatchingUseCase,
      inject: [PerformMatchingUseCase.DEPS_TOKEN],
      useFactory: (deps) => new PerformMatchingUseCase(deps),
    },

    // ---------------------------------------------------------------
    // Consumer — Phase 3g T062 + scheduler Phase 5 T078
    // ---------------------------------------------------------------
    BriefActivatedConsumer,
    AllMatchesRevokedScheduler,

    // ---------------------------------------------------------------
    // Use cases US3 — Phase 5
    // ---------------------------------------------------------------
    {
      provide: QueryMatchingResultUseCase.DEPS_TOKEN,
      inject: [MATCHING_RESULT_READER, CONFORMITE_QUERY_PORT],
      useFactory: (reader, conformiteQuery) => ({ reader, conformiteQuery }),
    },
    {
      provide: QueryMatchingResultUseCase,
      inject: [QueryMatchingResultUseCase.DEPS_TOKEN],
      useFactory: (deps) => new QueryMatchingResultUseCase(deps),
    },
    {
      provide: TriggerRematchUseCase.DEPS_TOKEN,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        PerformMatchingUseCase,
        MATCHING_RESULT_READER,
        MATCHING_RESULT_WRITER,
        MATCHING_AUDIT_WRITER,
        REDIS_REMATCH_LOCK,
      ],
      useFactory: (
        clock,
        uuid,
        performMatching,
        resultReader,
        resultWriter,
        auditWriter,
        lock,
      ) => ({
        clock,
        uuid,
        performMatching,
        resultReader,
        resultWriter,
        auditWriter,
        lock,
      }),
    },
    {
      provide: TriggerRematchUseCase,
      inject: [TriggerRematchUseCase.DEPS_TOKEN],
      useFactory: (deps) => new TriggerRematchUseCase(deps),
    },
    {
      provide: DetectAllMatchesRevokedUseCase.DEPS_TOKEN,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        MATCHING_RESULT_READER,
        CONFORMITE_QUERY_PORT,
        MATCHING_AUDIT_WRITER,
        MATCHING_OUTBOX_WRITER,
      ],
      useFactory: (clock, uuid, reader, conformiteQuery, auditWriter, outboxWriter) => ({
        clock,
        uuid,
        reader,
        conformiteQuery,
        auditWriter,
        outboxWriter,
      }),
    },
    {
      provide: DetectAllMatchesRevokedUseCase,
      inject: [DetectAllMatchesRevokedUseCase.DEPS_TOKEN],
      useFactory: (deps) => new DetectAllMatchesRevokedUseCase(deps),
    },

    // ---------------------------------------------------------------
    // Public port — exporté pour 012/015/admin US5 (Principe V)
    // ---------------------------------------------------------------
    PrismaMatchingQueryAdapter,
    { provide: MATCHING_QUERY_PORT, useExisting: PrismaMatchingQueryAdapter },

    // ---------------------------------------------------------------
    // Feature 012 — Leads : adapters → ports
    // ---------------------------------------------------------------
    PrismaLeadRepository,
    { provide: LEAD_WRITER, useExisting: PrismaLeadRepository },
    { provide: LEAD_READER, useExisting: PrismaLeadRepository },

    PrismaLeadNotificationOutbox,
    { provide: LEAD_NOTIFICATION_OUTBOX, useExisting: PrismaLeadNotificationOutbox },

    PrismaConsumedEventStore,
    { provide: CONSUMED_EVENT_STORE, useExisting: PrismaConsumedEventStore },

    PrismaLeadBriefSummaryReader,
    { provide: LEAD_BRIEF_SUMMARY_READER, useExisting: PrismaLeadBriefSummaryReader },

    SesLeadNotificationMailer,
    { provide: LEAD_NOTIFICATION_MAILER, useExisting: SesLeadNotificationMailer },

    PrismaConseillerIdentityResolver,
    { provide: CONSEILLER_IDENTITY_RESOLVER, useExisting: PrismaConseillerIdentityResolver },

    OtelLeadMetricsRecorder,
    { provide: LEAD_METRICS_RECORDER, useExisting: OtelLeadMetricsRecorder },

    // Port public lead (lecture seule) — consommé par 014/015.
    PrismaLeadQueryAdapter,
    { provide: MATCHING_LEAD_QUERY_PORT, useExisting: PrismaLeadQueryAdapter },

    // Use case consommation événements (US1) — factory deps.
    {
      provide: ConsumeMatchingEventUseCase.DEPS_TOKEN,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        CONSUMED_EVENT_STORE,
        LEAD_WRITER,
        LEAD_NOTIFICATION_OUTBOX,
        CONFORMITE_QUERY_PORT,
        LEAD_METRICS_RECORDER,
      ],
      useFactory: (
        clock,
        uuid,
        consumedEvents,
        leadWriter,
        notificationOutbox,
        conformiteQuery,
        metrics,
      ) => ({
        clock,
        uuid,
        consumedEvents,
        leadWriter,
        notificationOutbox,
        conformiteQuery,
        metrics,
      }),
    },
    {
      provide: ConsumeMatchingEventUseCase,
      inject: [ConsumeMatchingEventUseCase.DEPS_TOKEN],
      useFactory: (deps) => new ConsumeMatchingEventUseCase(deps),
    },

    // Use cases US2 — cycle de vie du lead (HTTP conseiller).
    {
      provide: RecordLeadTransitionUseCase.DEPS_TOKEN,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        LEAD_READER,
        LEAD_WRITER,
        CONFORMITE_QUERY_PORT,
        LEAD_METRICS_RECORDER,
        CONVERSATION_OPENER,
      ],
      useFactory: (
        clock,
        uuid,
        leadReader,
        leadWriter,
        conformiteQuery,
        metrics,
        conversationOpener,
      ) => ({
        clock,
        uuid,
        leadReader,
        leadWriter,
        conformiteQuery,
        metrics,
        conversationOpener,
      }),
    },
    {
      provide: RecordLeadTransitionUseCase,
      inject: [RecordLeadTransitionUseCase.DEPS_TOKEN],
      useFactory: (deps) => new RecordLeadTransitionUseCase(deps),
    },
    {
      provide: ViewLeadUseCase.DEPS_TOKEN,
      inject: [CLOCK, UUID_GENERATOR, LEAD_READER, LEAD_WRITER],
      useFactory: (clock, uuid, leadReader, leadWriter) => ({
        clock,
        uuid,
        leadReader,
        leadWriter,
      }),
    },
    {
      provide: ViewLeadUseCase,
      inject: [ViewLeadUseCase.DEPS_TOKEN],
      useFactory: (deps) => new ViewLeadUseCase(deps),
    },

    // Use case US3 — sweep de réconciliation (mode dégradé bus HS).
    {
      provide: ReconcileLeadsUseCase.DEPS_TOKEN,
      inject: [LEAD_READER, MATCHING_RESULT_READER, ConsumeMatchingEventUseCase],
      useFactory: (leadReader, matchingResultReader, consume) => ({
        leadReader,
        matchingResultReader,
        consume,
      }),
    },
    {
      provide: ReconcileLeadsUseCase,
      inject: [ReconcileLeadsUseCase.DEPS_TOKEN],
      useFactory: (deps) => new ReconcileLeadsUseCase(deps),
    },
    LeadReconciliationScheduler,

    // Jobs notifications conseiller (un job par destinataire) + consumer bus.
    LeadNotificationDispatcher,
    LeadNotificationSender,
    LeadNotificationWorker,
    MatchingEventsConsumer,

    // ---------------------------------------------------------------
    // Feature 013 — Conversation conseiller ↔ voyageur (US1)
    // Adapters → ports + use cases (ouverture, envoi, lecture).
    // ---------------------------------------------------------------
    PrismaConversationRepository,
    { provide: CONVERSATION_REPO, useExisting: PrismaConversationRepository },

    PrismaConversationNotificationOutbox,
    {
      provide: CONVERSATION_NOTIFICATION_OUTBOX,
      useExisting: PrismaConversationNotificationOutbox,
    },

    {
      provide: OpenConversationOnLeadAcceptedUseCase,
      inject: [CLOCK, UUID_GENERATOR, CONVERSATION_REPO],
      useFactory: (clock, uuid, repo) =>
        new OpenConversationOnLeadAcceptedUseCase({ clock, uuid, repo }),
    },
    {
      provide: SendMessageUseCase,
      inject: [
        CLOCK,
        UUID_GENERATOR,
        CONVERSATION_REPO,
        CONVERSATION_NOTIFICATION_OUTBOX,
        LEAD_READER,
        CONFORMITE_QUERY_PORT,
      ],
      useFactory: (clock, uuid, repo, outbox, leadReader, conformiteQuery) =>
        new SendMessageUseCase({ clock, uuid, repo, outbox, leadReader, conformiteQuery }),
    },
    {
      provide: ListConversationMessagesUseCase,
      inject: [CONVERSATION_REPO],
      useFactory: (repo) => new ListConversationMessagesUseCase({ repo }),
    },

    // T016 — ouverture du fil déclenchée par l'acceptation d'un lead (FR-001).
    // Adaptateur in-process consommé par RecordLeadTransitionUseCase.
    LeadAcceptedConversationOpener,
    { provide: CONVERSATION_OPENER, useExisting: LeadAcceptedConversationOpener },

    // T017 — notifications conversation (1 job/destinataire) : mailer SES +
    // dispatcher/sender/worker BullMQ. Drain périodique via OnModuleInit.
    SesConversationMailer,
    { provide: CONVERSATION_NOTIFICATION_MAILER, useExisting: SesConversationMailer },
    ConversationNotificationDispatcher,
    ConversationNotificationSender,
    ConversationNotificationWorker,

    // T024 — pièces jointes (US2) : stockage S3 ca-central-1 + use cases.
    S3AttachmentStorage,
    { provide: ATTACHMENT_STORAGE, useExisting: S3AttachmentStorage },
    {
      provide: CreateAttachmentUploadUseCase,
      inject: [UUID_GENERATOR, CONVERSATION_REPO, ATTACHMENT_STORAGE],
      useFactory: (uuid, repo, storage) =>
        new CreateAttachmentUploadUseCase({ uuid, repo, storage }),
    },
    {
      provide: FinalizeAttachmentUseCase,
      inject: [CONVERSATION_REPO],
      useFactory: (repo) => new FinalizeAttachmentUseCase({ repo }),
    },
    {
      provide: GetAttachmentUrlUseCase,
      inject: [CONVERSATION_REPO, ATTACHMENT_STORAGE],
      useFactory: (repo, storage) => new GetAttachmentUrlUseCase({ repo, storage }),
    },
  ],
  exports: [MATCHING_QUERY_PORT, MATCHING_LEAD_QUERY_PORT],
})
export class MatchingModule implements OnModuleInit, OnModuleDestroy {
  private outboxInterval?: NodeJS.Timeout;
  private leadDispatchInterval?: NodeJS.Timeout;
  private leadReconcileInterval?: NodeJS.Timeout;
  private conversationDispatchInterval?: NodeJS.Timeout;

  constructor(
    private readonly outboxJob: MatchingOutboxPublisherJob,
    private readonly leadDispatcher: LeadNotificationDispatcher,
    private readonly leadReconciliation: LeadReconciliationScheduler,
    private readonly conversationDispatcher: ConversationNotificationDispatcher,
  ) {}

  onModuleInit(): void {
    // Drain de l'outbox matching → bus Redis. 5 s en prod, 30 s en dev
    // (réduit le bruit), aligné sur le OutboxPublisherJob conformité.
    this.outboxInterval = setInterval(() => {
      void this.outboxJob.drain();
    }, OUTBOX_DRAIN_INTERVAL_MS);

    // Dispatch des notifications conseiller pending (résilience : couvre les
    // notifications enfilées hors flux temps réel, ex. après reprise SES).
    this.leadDispatchInterval = setInterval(() => {
      void this.leadDispatcher.dispatchPending();
    }, OUTBOX_DRAIN_INTERVAL_MS);

    // Sweep de réconciliation des leads (filet « bus HS », ADR-0026) — moins
    // fréquent : le pub/sub couvre le cas nominal.
    this.leadReconcileInterval = setInterval(() => {
      void this.leadReconciliation.sweep();
    }, LEAD_RECONCILE_INTERVAL_MS);

    // Dispatch des notifications conversation pending (013) — même cadence que
    // les notifications conseiller ; un job BullMQ par destinataire.
    this.conversationDispatchInterval = setInterval(() => {
      void this.conversationDispatcher.dispatchPending();
    }, OUTBOX_DRAIN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.outboxInterval) clearInterval(this.outboxInterval);
    if (this.leadDispatchInterval) clearInterval(this.leadDispatchInterval);
    if (this.leadReconcileInterval) clearInterval(this.leadReconcileInterval);
    if (this.conversationDispatchInterval) clearInterval(this.conversationDispatchInterval);
  }
}
