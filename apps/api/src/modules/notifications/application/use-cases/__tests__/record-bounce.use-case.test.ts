// T087 — Tests RecordBounceUseCase (RED first — Principe VI).
// Scénarios :
//   1. Bounce permanent → suppression list permanente
//   2. Bounce transient < 3 en 30j → pas de suppression
//   3. Bounce transient ≥ 3 en 30j → suppression TTL 30j
//   4. Bounce Undetermined → traité comme permanent

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationAuditLogWriter } from '../../ports/notification-audit-log-writer.port';
import type { NotificationLogReader } from '../../ports/notification-log-reader.port';
import type { NotificationLogWriter } from '../../ports/notification-log-writer.port';
import type { SuppressionListWriter } from '../../ports/suppression-list-writer.port';
import { type RecordBounceInput, RecordBounceUseCase } from '../record-bounce.use-case';

function makeLogWriter(): NotificationLogWriter {
  return {
    insert: vi.fn().mockResolvedValue({ id: 'log-1', created: true }),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    anonymizeByEmailHash: vi.fn().mockResolvedValue(0),
    sweepOldEntries: vi.fn().mockResolvedValue(0),
  };
}

function makeLogReader(softBounceCount = 0): NotificationLogReader {
  return {
    findByCorrelationId: vi.fn().mockResolvedValue(null),
    findBySesMessageId: vi.fn().mockResolvedValue(null),
    listDeadLetter: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
    metricsSnapshot: vi.fn().mockResolvedValue({}),
    countByStatus: vi.fn().mockResolvedValue(0),
    countRecentBounces: vi.fn().mockResolvedValue(softBounceCount),
  } as unknown as NotificationLogReader;
}

function makeSuppressionWriter(): SuppressionListWriter {
  return {
    upsert: vi.fn().mockResolvedValue({ id: 'sup-1', created: true }),
    softRemove: vi.fn().mockResolvedValue(undefined),
    markExpired: vi.fn().mockResolvedValue(0),
    sweepExpired: vi.fn().mockResolvedValue(0),
  };
}

function makeAuditWriter(): NotificationAuditLogWriter {
  return {
    append: vi.fn().mockResolvedValue(undefined),
  };
}

const BASE_INPUT: RecordBounceInput = {
  sesMessageId: 'msg-001',
  occurredAt: new Date('2026-05-26T10:01:00.000Z'),
  recipientEmail: 'user@example.com',
  recipientEmailHash: 'abc123hash',
  bounceType: 'Permanent',
  bounceSubType: 'General',
  diagnosticCode: 'smtp; 550 5.1.1',
  feedbackId: 'fb-001',
};

describe('RecordBounceUseCase', () => {
  let logWriter: NotificationLogWriter;
  let suppressionWriter: SuppressionListWriter;
  let auditWriter: NotificationAuditLogWriter;

  beforeEach(() => {
    logWriter = makeLogWriter();
    suppressionWriter = makeSuppressionWriter();
    auditWriter = makeAuditWriter();
  });

  it('Permanent bounce → creates permanent suppression entry', async () => {
    const logReader = makeLogReader(0);
    const uc = new RecordBounceUseCase(logWriter, logReader, suppressionWriter, auditWriter);

    await uc.execute(BASE_INPUT);

    expect(suppressionWriter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmailHashHMAC: 'abc123hash',
        reason: 'hard_bounce',
        expiresAt: null,
      }),
    );
    expect(auditWriter.append).toHaveBeenCalled();
  });

  it('Transient bounce with 1 recent soft bounce → no suppression', async () => {
    const logReader = makeLogReader(1);
    const uc = new RecordBounceUseCase(logWriter, logReader, suppressionWriter, auditWriter);

    await uc.execute({ ...BASE_INPUT, bounceType: 'Transient', bounceSubType: 'MailboxFull' });

    expect(suppressionWriter.upsert).not.toHaveBeenCalled();
  });

  it('Transient bounce with 3+ recent soft bounces → creates TTL-30d suppression', async () => {
    const logReader = makeLogReader(3);
    const uc = new RecordBounceUseCase(logWriter, logReader, suppressionWriter, auditWriter);

    await uc.execute({ ...BASE_INPUT, bounceType: 'Transient', bounceSubType: 'MailboxFull' });

    expect(suppressionWriter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmailHashHMAC: 'abc123hash',
        reason: 'soft_bounce_repeated',
        expiresAt: expect.any(Date),
      }),
    );
  });

  it('Undetermined bounce → treated as permanent', async () => {
    const logReader = makeLogReader(0);
    const uc = new RecordBounceUseCase(logWriter, logReader, suppressionWriter, auditWriter);

    await uc.execute({ ...BASE_INPUT, bounceType: 'Undetermined' });

    expect(suppressionWriter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'hard_bounce', expiresAt: null }),
    );
  });
});
