// T112 — Tests EraseRecipientHistoryUseCase — RED first (Principe VI).
// Scénarios :
//   1. Multi-row anonymisation → anonymizeByEmailHash appelé, audit émis
//   2. 0 rows → anonymizeByEmailHash appelé, audit émis (idempotent)
//   3. Audit contient les métadonnées correctes (hash + reason + count)

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationAuditLogWriter } from '../../ports/notification-audit-log-writer.port';
import type { NotificationLogWriter } from '../../ports/notification-log-writer.port';
import {
  type EraseRecipientHistoryInput,
  EraseRecipientHistoryUseCase,
} from '../erase-recipient-history.use-case';

function makeLogWriter(rowsAnonymized = 5): NotificationLogWriter {
  return {
    insert: vi.fn(),
    updateStatus: vi.fn(),
    anonymizeByEmailHash: vi.fn().mockResolvedValue(rowsAnonymized),
    sweepOldEntries: vi.fn().mockResolvedValue(0),
  };
}

function makeAuditWriter(): NotificationAuditLogWriter {
  return {
    append: vi.fn().mockResolvedValue(undefined),
  };
}

const BASE_INPUT: EraseRecipientHistoryInput = {
  recipientEmailHashHMAC: 'abc123hash',
  reason: 'user_request_art28',
  requestedAt: new Date('2026-05-26T10:00:00.000Z'),
};

describe('EraseRecipientHistoryUseCase', () => {
  let logWriter: NotificationLogWriter;
  let auditWriter: NotificationAuditLogWriter;

  beforeEach(() => {
    logWriter = makeLogWriter(5);
    auditWriter = makeAuditWriter();
  });

  it('anonymise les rows et émet un audit avec le bon count', async () => {
    const uc = new EraseRecipientHistoryUseCase(logWriter, auditWriter);
    const result = await uc.execute(BASE_INPUT);

    expect(result.rowsAnonymized).toBe(5);
    expect(logWriter.anonymizeByEmailHash).toHaveBeenCalledWith({
      recipientEmailHashHMAC: 'abc123hash',
      now: BASE_INPUT.requestedAt,
    });
    expect(auditWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'notification.recipient_history.erased',
        actorRole: 'system',
        targetEmailHashHMAC: 'abc123hash',
        reason: 'user_request_art28',
        metadata: expect.objectContaining({ rowsAnonymized: 5 }),
      }),
    );
  });

  it('0 rows → audit émis quand même (idempotent)', async () => {
    logWriter = makeLogWriter(0);
    const uc = new EraseRecipientHistoryUseCase(logWriter, auditWriter);
    const result = await uc.execute(BASE_INPUT);

    expect(result.rowsAnonymized).toBe(0);
    expect(auditWriter.append).toHaveBeenCalledOnce();
  });

  it('retourne rowsAnonymized correct pour N quelconque', async () => {
    logWriter = makeLogWriter(12);
    const uc = new EraseRecipientHistoryUseCase(logWriter, auditWriter);
    const result = await uc.execute({ ...BASE_INPUT, recipientEmailHashHMAC: 'other-hash' });

    expect(result.rowsAnonymized).toBe(12);
    expect(logWriter.anonymizeByEmailHash).toHaveBeenCalledWith(
      expect.objectContaining({ recipientEmailHashHMAC: 'other-hash' }),
    );
  });
});
