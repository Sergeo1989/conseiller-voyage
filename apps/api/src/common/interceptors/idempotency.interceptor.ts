// T020 — IdempotencyInterceptor.
// Lit le header `Idempotency-Key` sur les mutations (POST/PUT/PATCH/DELETE).
// Si présent : vérifie Redis ; cache HIT → retourne la réponse stockée ; cache
// MISS → exécute le handler, persiste la réponse pour 7 jours, retourne.
// Cf. constitution Principe X (idempotence obligatoire sur écritures
// publiques) + research.md R5.
//
// Le client Redis est injecté via DI (token REDIS_CLIENT). Wiring effectif en
// T025 (module BullMQ) ou T029 (module health) selon où Redis sera centralisé.

import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { type Observable, from, of, switchMap, tap } from 'rxjs';
import { env } from '../../env';

export const REDIS_CLIENT = Symbol.for('REDIS_CLIENT');

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const KEY_PREFIX = 'idempotency:';

interface RequestLike {
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const header = req.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;

    if (!MUTATION_METHODS.has(req.method) || !key) {
      return next.handle();
    }

    const redisKey = `${KEY_PREFIX}${key}`;

    return from(this.redis.get(redisKey)).pipe(
      switchMap((cached) => {
        if (cached !== null) {
          return of(JSON.parse(cached) as unknown);
        }
        return next.handle().pipe(
          tap((response) => {
            void this.redis.setex(
              redisKey,
              env.IDEMPOTENCY_KEY_TTL_SECONDS,
              JSON.stringify(response),
            );
          }),
        );
      }),
    );
  }
}
