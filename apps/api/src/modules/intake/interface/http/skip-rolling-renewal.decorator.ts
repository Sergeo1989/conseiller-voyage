// T025c — Décorateur @SkipRollingRenewal().
// Annote un handler de controller pour court-circuiter
// RollingSessionCookieInterceptor (T025b) :
//   - POST /api/intake/voyageur/erase-all-data (FR-022a — révocation
//     immédiate de la session après effacement global)
//   - POST /api/intake/briefs/:id/resend-magic-link (N1, T082a — opération
//     publique, pas de cookie en jeu)
//
// Pattern Reflector standard NestJS — la clé est lue par l'interceptor
// via `reflector.getAllAndOverride()` qui agrège méthode + classe.

import { SetMetadata } from '@nestjs/common';

export const SKIP_ROLLING_RENEWAL_KEY = 'intake:skipRollingRenewal';

export const SkipRollingRenewal = () => SetMetadata(SKIP_ROLLING_RENEWAL_KEY, true);
