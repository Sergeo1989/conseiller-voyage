// T075 — MfaOutboxDispatchWorker.
//
// Scanner `mfa_outbox_emails` (sentAt IS NULL + nextAttemptAt passé),
// construit une NotificationEnvelope, appelle NotificationPort.send().
// Pattern : outbox-source-contract.md section 2.3.
//
// Réentrant safe (flag `running`). Appelé via setInterval toutes les
// 5 s prod / 30 s dev (T076 — IdentiteModule.onModuleInit).

import { prisma } from '@cv/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../../notifications/interface/public-api/notification.port';
import { type MfaEmailTemplateKind, mapMfaTemplateKindToTemplateId } from './mfa-template-mapper';

const MAX_ATTEMPTS = 10;
const BACKOFF_DELAYS_SECONDS = [60, 300, 1800, 14400, 86400];
const BATCH_SIZE = 100;
const DEFAULT_LOCALE = 'fr-CA' as const;

@Injectable()
export class MfaOutboxDispatchWorker {
  private readonly logger = new Logger(MfaOutboxDispatchWorker.name);
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
        `MfaOutboxDispatch batch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async processBatch(): Promise<void> {
    const now = new Date();
    const rows = await prisma.mfaOutboxEmail.findMany({
      where: {
        sentAt: null,
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { queuedAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (rows.length === 0) return;
    this.logger.debug(`MfaOutboxDispatch draining ${rows.length} entries`);

    for (const row of rows) {
      await this.processOne(row);
    }
  }

  private async processOne(row: {
    id: string;
    recipientUserId: string;
    templateKind: string;
    payload: unknown;
    attempts: number;
    queuedAt: Date;
  }): Promise<void> {
    try {
      await this.dispatch(row);
    } catch (err) {
      await this.handleRetry(row.id, row.attempts, err);
    }
  }

  private async dispatch(row: {
    id: string;
    recipientUserId: string;
    templateKind: string;
    payload: unknown;
    queuedAt: Date;
  }): Promise<void> {
    const user = await prisma.authUser.findUnique({
      where: { id: row.recipientUserId },
      select: { email: true, preferredLocale: true },
    });

    if (!user?.email) {
      this.logger.warn(
        `MfaOutboxEmail ${row.id} — user ${row.recipientUserId} not found or no email, skipping`,
      );
      await prisma.mfaOutboxEmail.update({
        where: { id: row.id },
        data: { sentAt: new Date(), lastError: 'user not found or no email' },
      });
      return;
    }

    const recipientLocale: 'fr-CA' | 'en' = user.preferredLocale === 'en' ? 'en' : DEFAULT_LOCALE;
    const templateKind = row.templateKind as MfaEmailTemplateKind;
    const templateId = mapMfaTemplateKindToTemplateId(templateKind);

    const result = await this.notifications.send({
      schemaVersion: 1,
      correlationId: row.id,
      eventType: `mfa.${row.templateKind}`,
      templateId,
      recipientEmail: user.email,
      recipientLocale,
      templateData: row.payload as Record<string, unknown>,
      sourceModule: 'identite',
      enqueuedAt: row.queuedAt.toISOString(),
    });

    const isSent = result.accepted || result.reason === 'duplicate';
    await prisma.mfaOutboxEmail.update({
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
    await prisma.mfaOutboxEmail.update({
      where: { id },
      data: {
        attempts: nextAttempts,
        nextAttemptAt: new Date(Date.now() + backoffSec * 1000),
        lastError: message,
      },
    });
    if (nextAttempts >= MAX_ATTEMPTS) {
      this.logger.error(
        `MfaOutboxEmail ${id} reached MAX_ATTEMPTS=${MAX_ATTEMPTS}. Last error: ${message}`,
      );
    } else {
      this.logger.warn(
        `MfaOutboxEmail ${id} failed (attempt ${nextAttempts}), retry in ${backoffSec}s: ${message}`,
      );
    }
  }
}
