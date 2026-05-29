// T098 — IntakeDisposableEmailsRefreshJob.
//
// Cron BullMQ hebdomadaire (env INTAKE_DISPOSABLE_EMAILS_REFRESH_INTERVAL_HOURS,
// défaut 168 = 7 jours). Fetch GitHub raw
// https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf
// → set Redis SET `intake:disposable-emails` (TTL 30 jours).
//
// En cas d'échec fetch (network, GitHub down), on garde la valeur
// précédente du SET Redis. Le DisposableEmailCheckerImpl (T052) a
// déjà un fallback npm + snapshot embedded en plus.
//
// Le scheduling externe (cron repeatable BullMQ) est géré par le
// module intake ; ce job expose seulement la méthode `refresh()`.

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../../../common/interceptors/idempotency.interceptor';

const REDIS_KEY = 'intake:disposable-emails';
const REDIS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 jours
const GITHUB_URL =
  'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf';

@Injectable()
export class IntakeDisposableEmailsRefreshJob {
  private readonly logger = new Logger(IntakeDisposableEmailsRefreshJob.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Fetch + replace atomique du SET Redis.
   * Retourne le nombre de domaines insérés. Throw si fetch échoue (les
   * triggers de retry sont du ressort de BullMQ).
   */
  async refresh(): Promise<number> {
    this.logger.log(`Fetching disposable email blocklist from ${GITHUB_URL}`);
    const response = await fetch(GITHUB_URL, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Disposable list fetch failed : HTTP ${response.status}`);
    }
    const text = await response.text();
    const domains = parseDomainList(text);
    if (domains.length === 0) {
      throw new Error('Disposable list fetch returned 0 domains — refusing to replace');
    }

    // Replace atomique : pipeline DEL puis SADD multiple + EXPIRE
    const pipeline = this.redis.pipeline();
    pipeline.del(REDIS_KEY);
    // SADD limité à ~1000 args par appel → chunk
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < domains.length; i += CHUNK_SIZE) {
      const chunk = domains.slice(i, i + CHUNK_SIZE);
      pipeline.sadd(REDIS_KEY, ...chunk);
    }
    pipeline.expire(REDIS_KEY, REDIS_TTL_SECONDS);
    await pipeline.exec();

    this.logger.log(`Disposable list refreshed : ${domains.length} domains in ${REDIS_KEY}`);
    return domains.length;
  }
}

function parseDomainList(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}
