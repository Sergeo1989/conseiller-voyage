// T024 + T025d — IntakeModule.
//
// Phase 2 Foundational wiring :
//   - RollingSessionCookieInterceptor wired via APP_INTERCEPTOR scoped
//     module (Principe V — pas global app, l'interceptor ne traverse
//     que les controllers intake quand ils seront ajoutés en Phase 3+).
//   - Aucun controller exposé pour l'instant — viennent en T056/T082/
//     T082a/T106/T115d/T120.
//   - Aucun use case ni adapter — Phase 3+.
//
// Pattern hérité de packages/api/src/modules/conformite/interface/conformite.module.ts.

import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RollingSessionCookieInterceptor } from './interface/http/rolling-session-cookie.interceptor';

@Module({
  imports: [],
  controllers: [],
  providers: [
    {
      // T025d — interceptor scoped au module intake.
      // Quand un controller intake est ajouté (Phase 3 US1), ses handlers
      // passeront par cet interceptor pour le rolling renewal du cookie
      // session voyageur (FR-014a Q5).
      provide: APP_INTERCEPTOR,
      useClass: RollingSessionCookieInterceptor,
    },
  ],
  exports: [],
})
export class IntakeModule {}
