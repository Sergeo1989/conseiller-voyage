// T054 [US1] — PrismaIntakeOutboxWriter.
// Insère un événement dans `intake_outbox`. Le drain est délégué à
// OutboxPublisherJob (étendu depuis 001 en T134 Phase 8).

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type { IntakeOutboxEntryInput, IntakeOutboxWriter } from '../application/ports';

@Injectable()
export class PrismaIntakeOutboxWriter implements IntakeOutboxWriter {
  async enqueue(entry: IntakeOutboxEntryInput): Promise<void> {
    await prisma.intakeOutboxEntry.create({
      data: {
        id: entry.id,
        eventType: entry.eventType,
        payload: entry.payload as object,
      },
    });
  }
}
