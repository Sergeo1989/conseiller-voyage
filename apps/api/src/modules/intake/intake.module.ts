// T024 — IntakeModule (placeholder Phase 2 Foundational).
//
// Wiring DI minimal au stade Foundational :
//   - Aucun controller exposé (les controllers viendront en Phase 3 US1
//     T056/T082/T106/T115d, Phase 4 US2 T082, Phase 7 US5 T120, etc.)
//   - Aucun use case (Phase 3+)
//   - Aucun adapter Prisma/Redis/SES (Phase 3+)
//   - Le RollingSessionCookieInterceptor sera wired ici en T025d
//     (APP_INTERCEPTOR scoped au module, pas global app — Principe V)
//
// Pattern hérité de packages/api/src/modules/conformite/interface/conformite.module.ts.
//
// Conformément au Principe VIII.a §6 et au Principe V :
//   - Les ports (interfaces) vivent dans application/ports/
//   - Les use cases (classes injectables) vivent dans application/use-cases/
//   - Les adapters (implémentation concrète) vivent dans infrastructure/
//   - Les controllers vivent dans interface/http/
//   - Aucun import de @nestjs/* dans domain/

import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class IntakeModule {}
