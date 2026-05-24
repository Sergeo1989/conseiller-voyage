// T065 — PrismaOutboxWriter adapter.
// Implémente OutboxWriter (B1 — pattern outbox transactionnel).
//
// IMPORTANT : ce writer ne publie PAS l'événement. Il insère
// uniquement la row dans `conformite_outbox`. La publication effective
// est faite asynchroniquement par OutboxPublisherJob (T066) qui scanne
// la table, publie via ConformiteEventPublisher, et marque publishedAt.
//
// Pour l'atomicité avec la mutation métier (B1), ce writer N'EST PAS
// utilisé directement par les use cases — c'est PrismaConformiteRepository
// (T060) qui écrit les OutboxEntry dans la MÊME $transaction Prisma que
// la mutation métier (submitDossier, approveSubmission, refuseSubmission).
//
// Ce port reste utile pour les use cases qui écrivent UNIQUEMENT dans
// l'outbox sans mutation métier (ex: declarations système qui se
// limitent à publier un événement).

import { type Prisma, prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type { OutboxEntryToCreate, OutboxWriter } from '../application/ports/outbox-writer.port';

@Injectable()
export class PrismaOutboxWriter implements OutboxWriter {
  async write(entry: OutboxEntryToCreate): Promise<void> {
    await prisma.outboxEntry.create({
      data: {
        id: entry.id,
        eventType: entry.eventType,
        payload: entry.payload as Prisma.InputJsonValue,
      },
    });
  }
}
