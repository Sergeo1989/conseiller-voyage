// T072 — ConformiteModule.
// Wiring DI complet du module conformité — relie use cases (application)
// ↔ ports ↔ adapters (infrastructure) ↔ controllers (interface).
//
// Architecture (Principe VIII) :
//   - Les use cases sont enregistrés comme providers concrets.
//   - Les ports sont enregistrés via leur symbole DI et lient vers
//     l'adapter Prisma/S3/BullMQ correspondant.
//   - Les adapters ne sont JAMAIS référencés directement par les use
//     cases (inversion de dépendance).
//   - Clock + UuidGenerator viennent de common/ (T028 et T049b).
//
// Le scheduling de OutboxPublisherJob.drain() est délégué à un
// OnModuleInit handler qui pose un setInterval simple — sera remplacé
// par BullMQ repeatable ou @nestjs/schedule à mesure que d'autres
// scheduled jobs s'ajoutent.

import { BullModule } from '@nestjs/bullmq';
import { Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { CryptoUuidGenerator } from '../../../common/infrastructure/crypto-uuid-generator';
import { SystemClock } from '../../../common/infrastructure/system-clock';
import { CLOCK } from '../../../common/ports/clock.port';
import { UUID_GENERATOR } from '../../../common/ports/uuid-generator.port';
import { IdentiteModule } from '../../identite/identite.module';
import { AUDIT_LOG_WRITER } from '../application/ports/audit-log-writer.port';
import { CONFORMITE_EVENT_PUBLISHER } from '../application/ports/conformite-event-publisher.port';
import { CONFORMITE_READER } from '../application/ports/conformite-reader.port';
import { CONFORMITE_STATUS_CACHE } from '../application/ports/conformite-status-cache.port';
import { CONFORMITE_WRITER } from '../application/ports/conformite-writer.port';
import { DOCUMENT_STORAGE } from '../application/ports/document-storage.port';
import { NOTIFICATION_PORT } from '../application/ports/notification.port';
import { OUTBOX_WRITER } from '../application/ports/outbox-writer.port';
import { ApproveDossierUseCase } from '../application/use-cases/approve-dossier.use-case';
import { DeclarePermitRevokedUseCase } from '../application/use-cases/declare-permit-revoked.use-case';
import { EraseConseillerDataUseCase } from '../application/use-cases/erase-conseiller-data.use-case';
import { GetVerificationStatusUseCase } from '../application/use-cases/get-verification-status.use-case';
import { PropagateExpirationsUseCase } from '../application/use-cases/propagate-expirations.use-case';
import { RefuseDossierUseCase } from '../application/use-cases/refuse-dossier.use-case';
import { RequestErasureUseCase } from '../application/use-cases/request-erasure.use-case';
import { RequestUploadUrlsUseCase } from '../application/use-cases/request-upload-urls.use-case';
import { RevokeConseillerUseCase } from '../application/use-cases/revoke-conseiller.use-case';
import { SendExpirationRemindersUseCase } from '../application/use-cases/send-expiration-reminders.use-case';
import { SubmitDossierUseCase } from '../application/use-cases/submit-dossier.use-case';
import { ViewConseillerDossierUseCase } from '../application/use-cases/view-conseiller-dossier.use-case';
import {
  BullmqNotification,
  CONFORMITE_NOTIFICATIONS_QUEUE,
} from '../infrastructure/bullmq-notification';
import { ExpirationSweepJob } from '../infrastructure/jobs/expiration-sweep.job';
import { OutboxPublisherJob } from '../infrastructure/jobs/outbox-publisher.job';
import { PrismaAuditLogWriter } from '../infrastructure/prisma-audit-log-writer';
import { PrismaConformiteRepository } from '../infrastructure/prisma-conformite-repository';
import { PrismaOutboxWriter } from '../infrastructure/prisma-outbox-writer';
import { RedisConformiteEventPublisher } from '../infrastructure/redis-conformite-event-publisher';
import { RedisConformiteStatusCache } from '../infrastructure/redis-conformite-status-cache';
import { S3DocumentStorage } from '../infrastructure/s3-document-storage';
import { AdminConformiteController } from './http/admin-conformite.controller';
import { ConseillerConformiteController } from './http/conseiller-conformite.controller';
import { ConformiteQueryFacade } from './public-api/conformite-query.facade';

/** Intervalle drain outbox publisher (5 s — adaptable selon volumétrie). */
const OUTBOX_DRAIN_INTERVAL_MS = 5_000;
/** Intervalle sweep expirations (24 h — production tournera via cron 02:00 ca-central-1). */
const EXPIRATION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Module({
  imports: [
    IdentiteModule, // AuthGuard + AUTH_SESSION_READER
    BullModule.registerQueue({ name: CONFORMITE_NOTIFICATIONS_QUEUE }),
  ],
  controllers: [ConseillerConformiteController, AdminConformiteController],
  providers: [
    // --- Use cases (concrete classes) ---
    RequestUploadUrlsUseCase,
    SubmitDossierUseCase,
    ApproveDossierUseCase,
    RefuseDossierUseCase,
    SendExpirationRemindersUseCase,
    PropagateExpirationsUseCase,
    GetVerificationStatusUseCase,
    DeclarePermitRevokedUseCase,
    RevokeConseillerUseCase,
    ViewConseillerDossierUseCase,
    RequestErasureUseCase,
    EraseConseillerDataUseCase,

    // --- Ports → adapters ---
    // PrismaConformiteRepository implémente Reader + Writer → on
    // l'enregistre une fois en useClass et on alias les deux symboles
    // via factory (sinon Nest crée deux instances distinctes).
    PrismaConformiteRepository,
    { provide: CONFORMITE_READER, useExisting: PrismaConformiteRepository },
    { provide: CONFORMITE_WRITER, useExisting: PrismaConformiteRepository },

    { provide: DOCUMENT_STORAGE, useClass: S3DocumentStorage },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: OUTBOX_WRITER, useClass: PrismaOutboxWriter },
    { provide: NOTIFICATION_PORT, useClass: BullmqNotification },
    { provide: CONFORMITE_STATUS_CACHE, useClass: RedisConformiteStatusCache },
    { provide: CONFORMITE_EVENT_PUBLISHER, useClass: RedisConformiteEventPublisher },

    // --- Public API facade (consommée par autres modules) ---
    ConformiteQueryFacade,

    // --- Common (Clock + UuidGenerator) ---
    { provide: CLOCK, useClass: SystemClock },
    { provide: UUID_GENERATOR, useClass: CryptoUuidGenerator },

    // --- Background jobs ---
    OutboxPublisherJob,
    ExpirationSweepJob,
  ],
  exports: [
    // Public API : ConformiteQueryFacade pour matching/SEO (US3).
    ConformiteQueryFacade,
  ],
})
export class ConformiteModule implements OnModuleInit, OnModuleDestroy {
  private outboxInterval?: NodeJS.Timeout;
  private expirationInterval?: NodeJS.Timeout;

  constructor(
    private readonly outboxJob: OutboxPublisherJob,
    private readonly expirationJob: ExpirationSweepJob,
  ) {}

  onModuleInit(): void {
    this.outboxInterval = setInterval(() => {
      void this.outboxJob.drain();
    }, OUTBOX_DRAIN_INTERVAL_MS);
    this.expirationInterval = setInterval(() => {
      void this.expirationJob.sweep();
    }, EXPIRATION_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.outboxInterval) clearInterval(this.outboxInterval);
    if (this.expirationInterval) clearInterval(this.expirationInterval);
  }
}
