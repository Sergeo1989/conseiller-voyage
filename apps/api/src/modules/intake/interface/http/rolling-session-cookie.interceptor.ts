// T025b — RollingSessionCookieInterceptor.
//
// Cible : FR-014a Q5 clarify — à chaque visite ultérieure à une route
// protégée par un cookie session voyageur, renouveler le cookie pour
// 7 jours. 7j d'inactivité → cookie expire → magic link nécessaire.
//
// Règles :
//   - Filtre N3 : agit UNIQUEMENT sur `__Host-cv.intake.token` (prod)
//     ou `cv.intake.session` (dev). Autres cookies ignorés.
//   - Statut < 400 uniquement (pas d'extension sur erreur).
//   - Pas d'extension si handler annoté `@SkipRollingRenewal()`.
//   - Pas d'extension si handler throw (l'observable signale l'erreur,
//     le `tap` côté success ne se déclenche pas).
//
// Scoped au module intake via APP_INTERCEPTOR dans intake.module.ts
// (T025d) — Principe V frontière modulaire.

import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Reflector est un runtime token NestJS (injection DI dans le constructeur)
import { Reflector } from '@nestjs/core';
import { type Observable, tap } from 'rxjs';
import { SKIP_ROLLING_RENEWAL_KEY } from './skip-rolling-renewal.decorator';

const PROD_COOKIE_NAME = '__Host-cv.intake.token';
const DEV_COOKIE_NAME = 'cv.intake.session';
const TRACKED_COOKIE_NAMES = [PROD_COOKIE_NAME, DEV_COOKIE_NAME] as const;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface RequestLike {
  cookies?: Record<string, string | undefined>;
}

interface ResponseLike {
  statusCode: number;
  cookie(name: string, value: string, options: Record<string, unknown>): void;
}

@Injectable()
export class RollingSessionCookieInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ROLLING_RENEWAL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<RequestLike>();
    const res = http.getResponse<ResponseLike>();

    // Filtre N3 : ne tracker que le cookie voyageur.
    const trackedName = TRACKED_COOKIE_NAMES.find((name) => Boolean(req.cookies?.[name]));
    if (!trackedName) {
      return next.handle();
    }
    const trackedValue = req.cookies?.[trackedName];
    if (!trackedValue) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        // Statut < 400 = renewal autorisé. Anti-extension de session sur
        // erreur (Q5 clarify intention).
        if (res.statusCode >= 400) return;

        const useProdFlags = trackedName === PROD_COOKIE_NAME;
        res.cookie(trackedName, trackedValue, {
          maxAge: SEVEN_DAYS_MS,
          httpOnly: true,
          secure: useProdFlags,
          sameSite: 'lax',
          path: '/',
        });
      }),
    );
  }
}
