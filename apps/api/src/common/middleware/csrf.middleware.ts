// T021 — CsrfProtectionMiddleware.
// Vérifie le header `X-Requested-By: web` sur toute mutation. Combiné au
// cookie `SameSite=Lax` (configuré côté Auth.js — ADR-0004), cela bloque
// les attaques CSRF classiques sans token explicite.
// Cf. research.md R11 (résolution B6 du review).

import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HEADER_NAME = 'x-requested-by';
const EXPECTED_VALUE = 'web';

interface CsrfRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class CsrfProtectionMiddleware implements NestMiddleware {
  use(req: CsrfRequest, _res: unknown, next: (err?: Error) => void): void {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const raw = req.headers[HEADER_NAME];
    const value = Array.isArray(raw) ? raw[0] : raw;

    if (value !== EXPECTED_VALUE) {
      throw new ForbiddenException(
        'CSRF protection: missing or invalid `X-Requested-By` header on mutating request.',
      );
    }

    next();
  }
}
