// T057 — Adapter Prisma : MatchingOutboxWriter.
// L'INSERT vit dans la même transaction que la création du MatchingResult
// (passé via $transaction côté use case — voir T055). La contrainte UNIQUE
// sur idempotencyKey rejette tout doublon (replay protection).

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  MatchingOutboxEnqueueResult,
  MatchingOutboxEntryInput,
  MatchingOutboxWriter,
} from '../application/ports/matching-outbox-writer.port';

@Injectable()
export class PrismaMatchingOutboxWriter implements MatchingOutboxWriter {
  async enqueue(entry: MatchingOutboxEntryInput): Promise<MatchingOutboxEnqueueResult> {
    try {
      await prisma.matchingOutboxEntry.create({
        data: {
          id: entry.id,
          eventType: entry.eventType,
          payload: entry.payload as object,
          idempotencyKey: entry.idempotencyKey,
        },
      });
      return { kind: 'enqueued' };
    } catch (err) {
      // P2002 = UNIQUE constraint violation sur idempotencyKey
      if (isUniqueViolation(err)) return { kind: 'duplicate' };
      throw err;
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
