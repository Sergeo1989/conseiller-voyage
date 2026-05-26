// T049 — PrismaAuthOutboxWriter (feature 002).
//
// INSERT dans auth_outbox_emails. Drainée par worker SES feature 003.

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  AuthOutboxWriter,
  EnqueueAuthEmailInput,
} from '../application/ports/auth-outbox-writer.port';

@Injectable()
export class PrismaAuthOutboxWriter implements AuthOutboxWriter {
  async enqueue(input: EnqueueAuthEmailInput): Promise<void> {
    await prisma.authOutboxEmail.create({
      data: {
        recipientUserId: input.recipientUserId ?? null,
        recipientEmail: input.recipientEmail,
        templateKind: input.templateKind,
        payload: input.payload,
      },
    });
  }
}
