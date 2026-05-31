import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { LoggerModule } from './common/logger.module';
import { CsrfProtectionMiddleware } from './common/middleware/csrf.middleware';
import { ThrottlerModule } from './common/throttler.module';
import { HealthModule } from './health/health.module';
import { ConformiteModule } from './modules/conformite/interface/conformite.module';
import { IdentiteModule } from './modules/identite/identite.module';
import { IntakeModule } from './modules/intake/intake.module';
import { MatchingModule } from './modules/matching/matching.module';
import { BullMqModule } from './queue/bullmq.module';

/**
 * Module racine NestJS.
 *
 * Wiring de défense en profondeur (NON-NÉGOCIABLE — Principe IX) :
 *
 * 1. **ThrottlerGuard global** : rate-limit 100 req/min/IP sur tous les
 *    endpoints. Les endpoints sensibles overrideront via `@Throttle()`.
 *
 * 2. **IdempotencyInterceptor global** : tout endpoint mutant qui reçoit
 *    un header `Idempotency-Key` voit sa première réponse cachée 7 jours
 *    et toute re-soumission avec la même clé retourne la réponse cachée.
 *    Principe X — idempotence obligatoire sur les mutations conformité,
 *    notification, paiement, effacement Loi 25.
 *
 * 3. **CsrfProtectionMiddleware** : sur toutes les routes `/api/*` non-GET,
 *    refuse si le header `X-Requested-By: web|admin-cli` est absent.
 *    Le navigateur ne peut pas falsifier ce header cross-origin sans CORS
 *    explicite (qui n'existe pas — les Server Actions Next.js servent de
 *    proxy authentifié). Empêche le CSRF classique côté cookies session.
 *
 * Sans ce wiring, les classes existaient mais n'étaient JAMAIS exécutées —
 * les commentaires des controllers ("X-Requested-By vérifié") étaient
 * faux en runtime. Documenté par /review pré-merge (2026-05-25).
 */
@Module({
  imports: [
    LoggerModule,
    ThrottlerModule,
    BullMqModule,
    IdentiteModule,
    HealthModule,
    ConformiteModule,
    IntakeModule,
    MatchingModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // CSRF middleware sur toutes les mutations (POST/PUT/PATCH/DELETE)
    // de l'API. Les GET sont exemptés (read-only, pas de side effect).
    consumer
      .apply(CsrfProtectionMiddleware)
      .forRoutes(
        { path: 'api/*', method: RequestMethod.POST },
        { path: 'api/*', method: RequestMethod.PUT },
        { path: 'api/*', method: RequestMethod.PATCH },
        { path: 'api/*', method: RequestMethod.DELETE },
      );
  }
}
