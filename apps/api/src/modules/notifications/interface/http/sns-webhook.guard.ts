// T085 — SnsWebhookGuard.
//
// Valide la signature HMAC + fenêtre anti-replay (±5 min).
// Cf. contracts/sns-event-schema.md section 4.
//
// Trois protections :
//   1. Headers obligatoires (signature + timestamp).
//   2. Anti-replay : |now - timestamp| ≤ 300 s.
//   3. HMAC-SHA256 sur `timestamp.body` — timing-safe compare.

import * as crypto from 'node:crypto';
import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';

export const SNS_HMAC_SECRET = Symbol.for('NotificationsSnsHmacSecret');

const REPLAY_WINDOW_SECONDS = 300;

@Injectable()
export class SnsWebhookGuard implements CanActivate {
  constructor(
    @Inject(SNS_HMAC_SECRET) private readonly secret: string,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest & { rawBody?: Buffer }>();
    const provided = req.headers['x-cv-sns-signature'] as string | undefined;
    const timestamp = req.headers['x-cv-sns-timestamp'] as string | undefined;

    if (!provided?.startsWith('sha256=') || !timestamp) return false;

    const tsNum = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(tsNum)) return false;

    const nowSec = Math.floor(this.clock.now().getTime() / 1000);
    if (Math.abs(nowSec - tsNum) > REPLAY_WINDOW_SECONDS) return false;

    const rawBody = req.rawBody ?? Buffer.from('');
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(`${timestamp}.${rawBody.toString('utf-8')}`)
      .digest('hex');

    const expectedHeader = `sha256=${expected}`;
    try {
      return (
        crypto.timingSafeEqual(
          Buffer.from(provided.padEnd(expectedHeader.length)),
          Buffer.from(expectedHeader),
        ) && provided.length === expectedHeader.length
      );
    } catch {
      return false;
    }
  }
}
