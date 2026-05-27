// T088 — Tests RecordComplaintUseCase (RED first).
// Scénario unique : toujours suppression permanente.

import { describe, expect, it, vi } from 'vitest';
import type { NotificationAuditLogWriter } from '../../ports/notification-audit-log-writer.port';
import type { NotificationLogWriter } from '../../ports/notification-log-writer.port';
import type { SuppressionListWriter } from '../../ports/suppression-list-writer.port';
import { type RecordComplaintInput, RecordComplaintUseCase } from '../record-complaint.use-case';

const INPUT: RecordComplaintInput = {
  sesMessageId: 'msg-003',
  occurredAt: new Date('2026-05-26T10:05:00.000Z'),
  recipientEmail: 'complainer@example.com',
  recipientEmailHash: 'hashcomplainer',
  complaintFeedbackType: 'abuse',
  userAgent: 'Gmail',
  feedbackId: 'fb-003',
};

describe('RecordComplaintUseCase', () => {
  it('always creates permanent suppression entry', async () => {
    const logWriter: NotificationLogWriter = {
      insert: vi.fn().mockResolvedValue({ id: 'log-1', created: true }),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      anonymizeByEmailHash: vi.fn().mockResolvedValue(0),
      sweepOldEntries: vi.fn().mockResolvedValue(0),
    };
    const suppressionWriter: SuppressionListWriter = {
      upsert: vi.fn().mockResolvedValue({ id: 'sup-1', created: true }),
      softRemove: vi.fn().mockResolvedValue(undefined),
      markExpired: vi.fn().mockResolvedValue(0),
      sweepExpired: vi.fn().mockResolvedValue(0),
    };
    const auditWriter: NotificationAuditLogWriter = {
      append: vi.fn().mockResolvedValue(undefined),
    };

    const uc = new RecordComplaintUseCase(logWriter, suppressionWriter, auditWriter);
    await uc.execute(INPUT);

    expect(suppressionWriter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmailHashHMAC: 'hashcomplainer',
        reason: 'complaint',
        expiresAt: null,
      }),
    );
    expect(auditWriter.append).toHaveBeenCalled();
  });
});
