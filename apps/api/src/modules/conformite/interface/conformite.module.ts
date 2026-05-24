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
import { CONFORMITE_READER } from '../application/ports/conformite-reader.port';
import { CONFORMITE_WRITER } from '../application/ports/conformite-writer.port';
import { DOCUMENT_STORAGE } from '../application/ports/document-storage.port';
import { NOTIFICATION_PORT } from '../application/ports/notification.port';
import { OUTBOX_WRITER } from '../application/ports/outbox-writer.port';
import { ApproveDossierUseCase } from '../application/use-cases/approve-dossier.use-case';
import { RefuseDossierUseCase } from '../application/use-cases/refuse-dossier.use-case';
import { RequestUploadUrlsUseCase } from '../application/use-cases/request-upload-urls.use-case';
import { SubmitDossierUseCase } from '../application/use-cases/submit-dossier.use-case';
import {
  BullmqNotification,
  CONFORMITE_NOTIFICATIONS_QUEUE,
} from '../infrastructure/bullmq-notification';
import { OutboxPublisherJob } from '../infrastructure/jobs/outbox-publisher.job';
import { PrismaAuditLogWriter } from '../infrastructure/prisma-audit-log-writer';
import { PrismaConformiteRepository } from '../infrastructure/prisma-conformite-repository';
import { PrismaOutboxWriter } from '../infrastructure/prisma-outbox-writer';
import { S3DocumentStorage } from '../infrastructure/s3-document-storage';
import { AdminConformiteController } from './http/admin-conformite.controller';
import { ConseillerConformiteController } from './http/conseiller-conformite.controller';

/** Intervalle drain outbox publisher (5 s — adaptable selon volumétrie). */
const OUTBOX_DRAIN_INTERVAL_MS = 5_000;

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

    // --- Common (Clock + UuidGenerator) ---
    { provide: CLOCK, useClass: SystemClock },
    { provide: UUID_GENERATOR, useClass: CryptoUuidGenerator },

    // --- Background job ---
    OutboxPublisherJob,
  ],
  exports: [
    // Réservé aux futures intégrations cross-module (ex: matching aura
    // besoin du ConformiteReader pour filtrer les verified). Pour
    // l'instant US1 ne consomme rien d'externe.
  ],
})
export class ConformiteModule implements OnModuleInit, OnModuleDestroy {
  private outboxInterval?: NodeJS.Timeout;

  constructor(private readonly outboxJob: OutboxPublisherJob) {}

  onModuleInit(): void {
    // Démarre le drain en arrière-plan. void = fire-and-forget,
    // les erreurs sont gérées dans OutboxPublisherJob.drain().
    this.outboxInterval = setInterval(() => {
      void this.outboxJob.drain();
    }, OUTBOX_DRAIN_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.outboxInterval) {
      clearInterval(this.outboxInterval);
    }
  }
}
