// T062 — AuthOutboxDispatchWorker.
//
// Scanner `auth_outbox_emails` (sentAt IS NULL + nextAttemptAt passé),
// construit une NotificationEnvelope, appelle NotificationPort.send().
// Pattern : outbox-source-contract.md section 2.2.
//
// Réentrant safe (flag `running`). Appelé via setInterval toutes les
// 5 s prod / 30 s dev (T063 — IdentiteModule.onModuleInit).

import { prisma } from '@cv/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../../notifications/interface/public-api/notification.port';
import { mapAuthTemplateKindToTemplateId } from './auth-template-mapper';

const MAX_ATTEMPTS = 10;
const BACKOFF_DELAYS_SECONDS = [60, 300, 1800, 14400, 86400];
const BATCH_SIZE = 100;
const DEFAULT_LOCALE = 'fr-CA' as const;

@Injectable()
export class AuthOutboxDispatchWorker {
  private readonly logger = new Logger(AuthOutboxDispatchWorker.name);
  private running = false;

  constructor(
    @Inject(NOTIFICATION_PORT)
    private readonly notifications: NotificationPort,
  ) {}

  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processBatch();
    } catch (error) {
      this.logger.error(
        `AuthOutboxDispatch batch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async processBatch(): Promise<void> {
    const now = new Date();
    const rows = await prisma.authOutboxEmail.findMany({
      where: {
        sentAt: null,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (rows.length === 0) return;
    this.logger.debug(`AuthOutboxDispatch draining ${rows.length} entries`);

    for (const row of rows) {
      await this.processOne(row);
    }
  }

  private async processOne(row: {
    id: string;
    recipientUserId: string | null;
    recipientEmail: string;
    templateKind: string;
    payload: unknown;
    attempts: number;
    createdAt: Date;
  }): Promise<void> {
    try {
      await this.dispatch(row);
    } catch (err) {
      await this.handleRetry(row.id, row.attempts, err);
    }
  }

  private async dispatch(row: {
    id: string;
    recipientUserId: string | null;
    recipientEmail: string;
    templateKind: string;
    payload: unknown;
    createdAt: Date;
  }): Promise<void> {
    let recipientLocale: 'fr-CA' | 'en' = DEFAULT_LOCALE;
    if (row.recipientUserId) {
      const user = await prisma.authUser.findUnique({
        where: { id: row.recipientUserId },
        select: { preferredLocale: true },
      });
      if (user?.preferredLocale === 'en') recipientLocale = 'en';
    }

    const templateKind = row.templateKind as Parameters<typeof mapAuthTemplateKindToTemplateId>[0];
    const templateId = mapAuthTemplateKindToTemplateId(templateKind);

    const result = await this.notifications.send({
      schemaVersion: 1,
      correlationId: row.id,
      eventType: `auth.${row.templateKind}`,
      templateId,
      recipientEmail: row.recipientEmail,
      recipientLocale,
      templateData: row.payload as Record<string, unknown>,
      sourceModule: 'identite',
      enqueuedAt: row.createdAt.toISOString(),
    });

    const isSent = result.accepted || result.reason === 'duplicate';
    await prisma.authOutboxEmail.update({
      where: { id: row.id },
      data: { sentAt: new Date(), lastError: isSent ? null : `Skipped: ${result.reason}` },
    });
  }

  private async handleRetry(id: string, attempts: number, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const nextAttempts = attempts + 1;
    const backoffSec =
      BACKOFF_DELAYS_SECONDS[Math.min(attempts, BACKOFF_DELAYS_SECONDS.length - 1)] ??
      BACKOFF_DELAYS_SECONDS[BACKOFF_DELAYS_SECONDS.length - 1] ??
      3600;
    await prisma.authOutboxEmail.update({
      where: { id },
      data: {
        attempts: nextAttempts,
        nextAttemptAt: new Date(Date.now() + backoffSec * 1000),
        lastError: message,
      },
    });
    if (nextAttempts >= MAX_ATTEMPTS) {
      this.logger.error(
        `AuthOutboxEmail ${id} reached MAX_ATTEMPTS=${MAX_ATTEMPTS}. Last error: ${message}`,
      );
    } else {
      this.logger.warn(
        `AuthOutboxEmail ${id} failed (attempt ${nextAttempts}), retry in ${backoffSec}s: ${message}`,
      );
    }
  }
}
