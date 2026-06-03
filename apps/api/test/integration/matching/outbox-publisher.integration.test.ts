// T093 — Integration test MatchingOutboxPublisherJob (PR satellite Mode B).
//
// Vérifie le drain end-to-end : une ligne `matching_outbox_entries` non
// publiée → drain → event publié sur le canal Redis (nom kebab-case +
// idempotencyKey + payload) → `publishedAt` positionné → pas de republish.
//
// PRÉREQUIS : Postgres + Redis (pnpm docker:up). Skip propre sinon.

import { prisma } from '@cv/db';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../../src/env';
import { MatchingOutboxPublisherJob } from '../../../src/modules/matching/infrastructure/jobs/matching-outbox-publisher.job';
import { RedisMatchingEventPublisher } from '../../../src/modules/matching/infrastructure/redis-matching-event-publisher';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CHANNEL = env.MATCHING_PUBSUB_CHANNEL;
const IDEMPOTENCY_PREFIX = 'test:outbox-pub:';

interface ReceivedEvent {
  name: string;
  idempotencyKey: string;
  payload: { briefId?: string };
}

async function infraAvailable(): Promise<boolean> {
  const r = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await r.connect();
    await r.ping();
    await r.quit();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    try {
      await r.quit();
    } catch {
      // ignore
    }
    return false;
  }
}

describe('MatchingOutboxPublisherJob (integration)', () => {
  let pubClient: Redis;
  let subClient: Redis;
  let job: MatchingOutboxPublisherJob;
  let received: ReceivedEvent[] = [];
  let skipAll = false;

  beforeAll(async () => {
    if (!(await infraAvailable())) {
      skipAll = true;
      return;
    }
    pubClient = new Redis(REDIS_URL);
    subClient = new Redis(REDIS_URL);
    job = new MatchingOutboxPublisherJob(new RedisMatchingEventPublisher(pubClient));
    await subClient.subscribe(CHANNEL);
    subClient.on('message', (_channel, message) => {
      received.push(JSON.parse(message) as ReceivedEvent);
    });
  });

  afterAll(async () => {
    if (skipAll) return;
    await prisma.matchingOutboxEntry.deleteMany({
      where: { idempotencyKey: { startsWith: IDEMPOTENCY_PREFIX } },
    });
    await subClient.quit();
    await pubClient.quit();
  });

  beforeEach(async () => {
    if (skipAll) return;
    received = [];
    await prisma.matchingOutboxEntry.deleteMany({
      where: { idempotencyKey: { startsWith: IDEMPOTENCY_PREFIX } },
    });
  });

  /** Attend qu'au moins `n` messages soient reçus (pub/sub asynchrone). */
  async function waitForMessages(n: number, timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (received.length < n && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it.skipIf(skipAll)(
    'draine un event non publié → publié sur le bus + publishedAt positionné',
    async () => {
      if (skipAll) return;
      const briefId = '11111111-1111-4111-8111-aaaaaaaaaaaa';
      const idempotencyKey = `${IDEMPOTENCY_PREFIX}${briefId}:ok`;
      const entry = await prisma.matchingOutboxEntry.create({
        data: {
          eventType: 'voyageur_brief_matched',
          payload: { matchingResultId: 'mr-1', briefId, matchedCount: 3 },
          idempotencyKey,
        },
      });

      await job.drain();
      await waitForMessages(1);

      expect(received).toHaveLength(1);
      expect(received[0]?.name).toBe('voyageur.brief.matched');
      expect(received[0]?.idempotencyKey).toBe(idempotencyKey);
      expect(received[0]?.payload.briefId).toBe(briefId);

      const reloaded = await prisma.matchingOutboxEntry.findUnique({ where: { id: entry.id } });
      expect(reloaded?.publishedAt).not.toBeNull();
    },
  );

  it.skipIf(skipAll)('ne republie pas un event déjà publié (publishedAt set)', async () => {
    if (skipAll) return;
    const briefId = '22222222-2222-4222-8222-bbbbbbbbbbbb';
    await prisma.matchingOutboxEntry.create({
      data: {
        eventType: 'voyageur_brief_unmatched',
        payload: { briefId, matchedCount: 0 },
        idempotencyKey: `${IDEMPOTENCY_PREFIX}${briefId}:empty`,
        publishedAt: new Date(),
      },
    });

    await job.drain();
    await waitForMessages(1, 500);

    expect(received).toHaveLength(0);
  });

  it.skipIf(skipAll)('mappe chaque eventType enum vers son nom kebab-case', async () => {
    if (skipAll) return;
    const briefId = '33333333-3333-4333-8333-cccccccccccc';
    await prisma.matchingOutboxEntry.create({
      data: {
        eventType: 'voyageur_brief_partially_matched',
        payload: { briefId, matchedCount: 2 },
        idempotencyKey: `${IDEMPOTENCY_PREFIX}${briefId}:partial`,
      },
    });

    await job.drain();
    await waitForMessages(1);

    expect(received[0]?.name).toBe('voyageur.brief.partially_matched');
  });
});
