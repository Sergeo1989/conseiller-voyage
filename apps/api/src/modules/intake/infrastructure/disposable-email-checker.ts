// T052 [US1] — DisposableEmailCheckerImpl (FR-021).
//
// 3 sources, dans l'ordre :
//   1. Redis SET `intake:disposable-emails` — refresh hebdo par BullMQ
//      job T098 (depuis github.com/disposable-email-domains/...).
//   2. NPM package `disposable-email-domains` (T004) — fallback si Redis
//      miss au boot, snapshot semi-récent maintenu par la communauté.
//   3. Snapshot statique embedded `disposable-emails-snapshot.json`
//      (T099, à livrer) — dernier recours offline.
//
// La normalisation lowercase est faite côté entrée. Les sous-domaines
// (ex: `foo.mailinator.com`) sont comparés au domaine racine du blocklist
// (ex: `mailinator.com`) par suffix match.

import { Inject, Injectable } from '@nestjs/common';
import disposableDomains from 'disposable-email-domains';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../common/interceptors/idempotency.interceptor';
import type { DisposableEmailChecker } from '../application/ports';

const REDIS_KEY = 'intake:disposable-emails';

@Injectable()
export class DisposableEmailCheckerImpl implements DisposableEmailChecker {
  private fallbackSet: Set<string> = new Set(disposableDomains as ReadonlyArray<string>);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async isDisposable(email: string): Promise<boolean> {
    const domain = email.toLowerCase().trim().split('@')[1];
    if (!domain) return false;

    // 1. Lookup Redis (membre exact OU n'importe quel suffix-domain)
    const exact = await this.redis.sismember(REDIS_KEY, domain);
    if (exact === 1) return true;

    // Vérifie aussi le domaine parent (ex: foo.mailinator.com → mailinator.com)
    const parent = domain.split('.').slice(-2).join('.');
    if (parent !== domain) {
      const parentMatch = await this.redis.sismember(REDIS_KEY, parent);
      if (parentMatch === 1) return true;
    }

    // 2. Fallback npm snapshot
    if (this.fallbackSet.has(domain)) return true;
    if (parent !== domain && this.fallbackSet.has(parent)) return true;

    return false;
  }
}
