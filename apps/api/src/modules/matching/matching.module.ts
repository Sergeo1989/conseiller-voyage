// T030 — MatchingModule (feature 011 — Phase 2 Foundational placeholder).
//
// Phase 2 : module vide — pas encore d'adapter ni de use case wirés. Le
// wiring DI complet arrivera au fil des phases :
//   - Phase 3 (T053-T063 US1) : adapters Prisma + BullMQ consumer +
//     PerformMatchingUseCase + APP_INTERCEPTOR si besoin
//   - Phase 4 (T068 US2) : extension PerformMatching pour le boost
//   - Phase 5 (T078-T081 US3) : DetectAllMatchesRevokedScheduler +
//     TriggerRematchUseCase + admin-matching.controller
//
// Imports cross-module (Principe V — interfaces publiques uniquement) :
//   - BullMqModule : REDIS_CLIENT pour RedisRematchLock + futur consumer
//   - ConformiteModule : CONFORMITE_QUERY_PORT (filtre verified)
//   - IdentiteModule : AuthGuard + RoleGuard + AUTH_SESSION_READER (admin endpoint US5)
//   - IntakeModule : pas d'import direct — uniquement consumer event bus
//     `voyageur.brief.activated` via BullMQ (couplage indirect via event bus)
//
// Pattern hérité de intake.module.ts (feature 008).

import { Module } from '@nestjs/common';
import { BullMqModule } from '../../queue/bullmq.module';
import { ConformiteModule } from '../conformite/interface/conformite.module';
import { IdentiteModule } from '../identite/identite.module';

@Module({
  imports: [
    BullMqModule, // REDIS_CLIENT pour locks rematch + BullMQ consumer
    IdentiteModule, // AuthGuard + RoleGuard + AUTH_SESSION_READER (admin re-trigger T081)
    ConformiteModule, // CONFORMITE_QUERY_PORT pour filtre verified (T059)
  ],
  controllers: [
    // Phase 5 : AdminMatchingController (T081)
  ],
  providers: [
    // Phase 3 : adapters Prisma + ports DI (T055-T061)
    // Phase 3 : PerformMatchingUseCase (T053)
    // Phase 5 : QueryMatching/TriggerRematch/DetectAllMatchesRevoked use cases (T073/T075/T077)
    // Phase 5 : AdminMatchingController dependencies
  ],
  exports: [
    // Phase 5 : MATCHING_QUERY_PORT (consommé par 012 + 015 + extension US5 admin 008)
  ],
})
export class MatchingModule {}
