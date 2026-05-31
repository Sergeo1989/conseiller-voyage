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

import { Module } from '@nestjs/common';
import { CryptoUuidGenerator } from '../../common/infrastructure/crypto-uuid-generator';
import { SystemClock } from '../../common/infrastructure/system-clock';
import { CLOCK } from '../../common/ports/clock.port';
import { UUID_GENERATOR } from '../../common/ports/uuid-generator.port';
import { env } from '../../env';
import { BullMqModule } from '../../queue/bullmq.module';
import { ConformiteModule } from '../conformite/interface/conformite.module';
import { IdentiteModule } from '../identite/identite.module';
import {
  BRIEF_SNAPSHOT_READER,
  CONSEILLER_SNAPSHOT_READER,
  FSA_CENTROID_READER,
  MATCHING_AUDIT_WRITER,
  MATCHING_OUTBOX_WRITER,
  MATCHING_RESULT_READER,
  MATCHING_RESULT_WRITER,
  REDIS_REMATCH_LOCK,
} from './application/ports';
import { PerformMatchingUseCase } from './application/use-cases/perform-matching.use-case';
import { WeightsConfig } from './domain/value-objects/weights-config.vo';
import { EmbeddedFsaCentroidReader } from './infrastructure/embedded-fsa-centroid-reader';
import { BriefActivatedConsumer } from './infrastructure/jobs/brief-activated.consumer';
import { PrismaBriefSnapshotReader } from './infrastructure/prisma-brief-snapshot-reader';
import { PrismaConseillerSnapshotReader } from './infrastructure/prisma-conseiller-snapshot-reader';
import { PrismaMatchingAuditWriter } from './infrastructure/prisma-matching-audit-writer';
import { PrismaMatchingOutboxWriter } from './infrastructure/prisma-matching-outbox-writer';
import { PrismaMatchingResultRepository } from './infrastructure/prisma-matching-result-repository';
import { RedisRematchLockAdapter } from './infrastructure/redis-rematch-lock';

@Module({
  imports: [BullMqModule, IdentiteModule, ConformiteModule],
  controllers: [
    // Phase 5 T081 : AdminMatchingController (re-trigger endpoint)
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
        algorithmVersion: env.MATCHING_ALGORITHM_VERSION,
      }),
    },
    {
      provide: PerformMatchingUseCase,
      inject: [PerformMatchingUseCase.DEPS_TOKEN],
      useFactory: (deps) => new PerformMatchingUseCase(deps),
    },

    // ---------------------------------------------------------------
    // Consumer — Phase 3g T062
    // ---------------------------------------------------------------
    BriefActivatedConsumer,
  ],
  exports: [
    // Phase 5 T080 : MATCHING_QUERY_PORT (consommé par 012 + 015 + extension US5 admin 008)
  ],
})
export class MatchingModule {}
