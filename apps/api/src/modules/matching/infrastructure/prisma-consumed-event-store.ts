// T027 [US1] — PrismaConsumedEventStore.
// Première barrière d'idempotence at-least-once (ADR-0026) : trace les
// événements bus déjà traités (PK = idempotencyKey).

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type { ConsumedEventStore } from '../application/ports';

@Injectable()
export class PrismaConsumedEventStore implements ConsumedEventStore {
  async hasConsumed(idempotencyKey: string): Promise<boolean> {
    const row = await prisma.consumedMatchingEvent.findUnique({
      where: { idempotencyKey },
      select: { idempotencyKey: true },
    });
    return row !== null;
  }

  async recordConsumed(idempotencyKey: string, eventName: string): Promise<boolean> {
    try {
      await prisma.consumedMatchingEvent.create({ data: { idempotencyKey, eventName } });
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) return false; // déjà enregistré (concurrence)
      throw err;
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
