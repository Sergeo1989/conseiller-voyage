// T120 — Tests RetryDeadLetterUseCase — RED first.
// Scénarios :
//   1. Entry dead_letter → status reset + enqueue + audit
//   2. Entry introuvable → NotFoundException
//   3. Entry pas en dead_letter → ConflictException (ex: déjà delivered)
//   4. Motif trop court → ValidationError

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationLogEntry } from '../../../domain/entities/notification-log-entry.entity';
import type { NotificationAuditLogWriter } from '../../ports/notification-audit-log-writer.port';
import type { NotificationLogReader } from '../../ports/notification-log-reader.port';
import type { NotificationLogWriter } from '../../ports/notification-log-writer.port';
import { RetryDeadLetterUseCase } from '../retry-dead-letter.use-case';

const DEAD_LETTER_ENTRY: NotificationLogEntry = {
  id: 'log-001',
  correlationId: 'corr-001',
  sourceModule: 'identite',
  eventType: 'auth.email_verification',
  templateId: 'auth.email-verification',
  recipientEmailClear: 'test@example.com',
  recipientEmailCanonical: 'test@example.com',
  recipientEmailHashHMAC: 'abc123',
  recipientLocale: 'fr-CA',
  subject: null,
  htmlBody: null,
  textBody: null,
  status: 'dead_letter',
  attempts: 5,
  lastError: 'SES throttled',
  nextAttemptAt: null,
  enqueuedAt: new Date('2026-05-25T10:00:00.000Z'),
  sentAt: null,
  deliveredAt: null,
  bouncedAt: null,
  complainedAt: null,
  failedAt: new Date('2026-05-26T10:00:00.000Z'),
  erasedAt: null,
  sesMessageId: null,
  templateData: { ctaUrl: 'https://example.com' },
  createdAt: new Date('2026-05-25T10:00:00.000Z'),
  updatedAt: new Date('2026-05-26T10:00:00.000Z'),
};

function makeLogReader(entry: NotificationLogEntry | null): NotificationLogReader {
  return {
    findById: vi.fn().mockResolvedValue(entry),
    findByCorrelationId: vi.fn(),
    findBySesMessageId: vi.fn(),
    listDeadLetter: vi.fn(),
    metricsSnapshot: vi.fn(),
    countByStatus: vi.fn(),
    countRecentBounces: vi.fn(),
  } as unknown as NotificationLogReader;
}

function makeLogWriter(): NotificationLogWriter {
  return {
    insert: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    anonymizeByEmailHash: vi.fn(),
    sweepOldEntries: vi.fn().mockResolvedValue(0),
  };
}

function makeAuditWriter(): NotificationAuditLogWriter {
  return { append: vi.fn().mockResolvedValue(undefined) };
}

describe('RetryDeadLetterUseCase', () => {
  let logWriter: NotificationLogWriter;
  let auditWriter: NotificationAuditLogWriter;
  const enqueueFn = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    logWriter = makeLogWriter();
    auditWriter = makeAuditWriter();
    enqueueFn.mockClear();
  });

  it('dead_letter → status queued + enqueue + audit', async () => {
    const logReader = makeLogReader(DEAD_LETTER_ENTRY);
    const uc = new RetryDeadLetterUseCase(logReader, logWriter, auditWriter, enqueueFn);

    const result = await uc.execute({
      id: 'log-001',
      actorId: 'admin-1',
      reason: 'Quota SES augmenté ce matin.',
    });

    expect(logWriter.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'corr-001', status: 'queued', attempts: 0 }),
    );
    expect(enqueueFn).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'corr-001', templateId: 'auth.email-verification' }),
    );
    expect(auditWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'notification.dead_letter.retried_manual' }),
    );
    expect(result.retried).toBe(true);
  });

  it('entry introuvable → lève NotFoundException', async () => {
    const logReader = makeLogReader(null);
    const uc = new RetryDeadLetterUseCase(logReader, logWriter, auditWriter, enqueueFn);

    await expect(
      uc.execute({ id: 'log-999', actorId: 'admin-1', reason: 'Quota SES augmenté ce matin.' }),
    ).rejects.toThrow('not found');
  });

  it('entry en statut delivered (pas dead_letter) → lève ConflictException', async () => {
    const logReader = makeLogReader({ ...DEAD_LETTER_ENTRY, status: 'delivered' });
    const uc = new RetryDeadLetterUseCase(logReader, logWriter, auditWriter, enqueueFn);

    await expect(
      uc.execute({ id: 'log-001', actorId: 'admin-1', reason: 'Quota SES augmenté ce matin.' }),
    ).rejects.toThrow('not in dead_letter');
  });

  it('motif trop court → lève ValidationError', async () => {
    const logReader = makeLogReader(DEAD_LETTER_ENTRY);
    const uc = new RetryDeadLetterUseCase(logReader, logWriter, auditWriter, enqueueFn);

    await expect(
      uc.execute({ id: 'log-001', actorId: 'admin-1', reason: 'court' }),
    ).rejects.toThrow('reason');
  });
});
