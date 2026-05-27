// T089 — Tests RecordDeliveryUseCase (RED first).
// Scénario : update status → 'delivered' avec sesMessageId.

import { describe, expect, it, vi } from 'vitest';
import type { NotificationLogReader } from '../../ports/notification-log-reader.port';
import type { NotificationLogWriter } from '../../ports/notification-log-writer.port';
import { type RecordDeliveryInput, RecordDeliveryUseCase } from '../record-delivery.use-case';

const INPUT: RecordDeliveryInput = {
  sesMessageId: 'msg-004',
  occurredAt: new Date('2026-05-26T10:00:18.000Z'),
  recipientEmail: 'delivered@example.com',
  smtpResponse: '250 2.0.0 OK',
  processingTimeMillis: 17890,
};

describe('RecordDeliveryUseCase', () => {
  it('updates notification log status to delivered', async () => {
    const logEntry = { correlationId: 'corr-001', id: 'log-001', status: 'sent' };
    const logReader: NotificationLogReader = {
      findByCorrelationId: vi.fn().mockResolvedValue(null),
      findBySesMessageId: vi.fn().mockResolvedValue(logEntry),
      listDeadLetter: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
      metricsSnapshot: vi.fn().mockResolvedValue({}),
      countByStatus: vi.fn().mockResolvedValue(0),
      countRecentBounces: vi.fn().mockResolvedValue(0),
    } as unknown as NotificationLogReader;
    const logWriter: NotificationLogWriter = {
      insert: vi.fn().mockResolvedValue({ id: 'log-1', created: true }),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      anonymizeByEmailHash: vi.fn().mockResolvedValue(0),
      sweepOldEntries: vi.fn().mockResolvedValue(0),
    };

    const uc = new RecordDeliveryUseCase(logReader, logWriter);
    await uc.execute(INPUT);

    expect(logReader.findBySesMessageId).toHaveBeenCalledWith('msg-004');
    expect(logWriter.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'corr-001',
        status: 'delivered',
        sesMessageId: 'msg-004',
      }),
    );
  });

  it('is a no-op when log entry not found (idempotent)', async () => {
    const logReader: NotificationLogReader = {
      findByCorrelationId: vi.fn().mockResolvedValue(null),
      findBySesMessageId: vi.fn().mockResolvedValue(null),
      listDeadLetter: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
      metricsSnapshot: vi.fn().mockResolvedValue({}),
      countByStatus: vi.fn().mockResolvedValue(0),
      countRecentBounces: vi.fn().mockResolvedValue(0),
    } as unknown as NotificationLogReader;
    const logWriter: NotificationLogWriter = {
      insert: vi.fn().mockResolvedValue({ id: 'log-1', created: true }),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      anonymizeByEmailHash: vi.fn().mockResolvedValue(0),
      sweepOldEntries: vi.fn().mockResolvedValue(0),
    };

    const uc = new RecordDeliveryUseCase(logReader, logWriter);
    await uc.execute(INPUT);

    expect(logWriter.updateStatus).not.toHaveBeenCalled();
  });
});
