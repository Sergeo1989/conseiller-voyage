// T119 — Tests RemoveFromSuppressionListUseCase — RED first.
// Scénarios :
//   1. Retrait valide → softRemove + audit
//   2. Entry introuvable → NotFoundException
//   3. Entry déjà retirée → ConflictException
//   4. Motif trop court (< 10 chars) → ValidationError

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SuppressionListEntry } from '../../../domain/entities/suppression-list-entry.entity';
import type { NotificationAuditLogWriter } from '../../ports/notification-audit-log-writer.port';
import type { SuppressionListReader } from '../../ports/suppression-list-reader.port';
import type { SuppressionListWriter } from '../../ports/suppression-list-writer.port';
import { RemoveFromSuppressionListUseCase } from '../remove-from-suppression-list.use-case';

const ACTIVE_ENTRY: SuppressionListEntry = {
  id: 'sup-001',
  recipientEmailHashHMAC: 'abc123',
  reason: 'hard_bounce',
  source: 'ses_sns_bounce',
  details: null,
  addedAt: new Date('2026-05-01T00:00:00.000Z'),
  expiresAt: null,
  removedAt: null,
  removedByActorId: null,
  removedReason: null,
};

const REMOVED_ENTRY: SuppressionListEntry = { ...ACTIVE_ENTRY, removedAt: new Date() };

function makeReader(entry: SuppressionListEntry | null): SuppressionListReader {
  return {
    findById: vi.fn().mockResolvedValue(entry),
    findByEmailHash: vi.fn(),
    list: vi.fn(),
  };
}

function makeWriter(): SuppressionListWriter {
  return {
    upsert: vi.fn(),
    softRemove: vi.fn().mockResolvedValue(undefined),
    markExpired: vi.fn(),
    sweepExpired: vi.fn().mockResolvedValue(0),
  };
}

function makeAuditWriter(): NotificationAuditLogWriter {
  return { append: vi.fn().mockResolvedValue(undefined) };
}

describe('RemoveFromSuppressionListUseCase', () => {
  let suppressionWriter: SuppressionListWriter;
  let auditWriter: NotificationAuditLogWriter;

  beforeEach(() => {
    suppressionWriter = makeWriter();
    auditWriter = makeAuditWriter();
  });

  it('retrait valide → softRemove + audit émis', async () => {
    const reader = makeReader(ACTIVE_ENTRY);
    const uc = new RemoveFromSuppressionListUseCase(reader, suppressionWriter, auditWriter);

    const result = await uc.execute({
      id: 'sup-001',
      actorId: 'admin-1',
      reason: 'Faux positif confirmé.',
    });

    expect(suppressionWriter.softRemove).toHaveBeenCalledWith({
      id: 'sup-001',
      removedByActorId: 'admin-1',
      removedReason: 'Faux positif confirmé.',
    });
    expect(auditWriter.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'notification.suppression.removed_manual' }),
    );
    expect(result.removed).toBe(true);
    expect(result.removedAt).toBeInstanceOf(Date);
  });

  it('entry introuvable → lève NotFoundException', async () => {
    const reader = makeReader(null);
    const uc = new RemoveFromSuppressionListUseCase(reader, suppressionWriter, auditWriter);

    await expect(
      uc.execute({ id: 'sup-999', actorId: 'admin-1', reason: 'Faux positif confirmé.' }),
    ).rejects.toThrow('not found');
  });

  it('entry déjà retirée → lève ConflictException', async () => {
    const reader = makeReader(REMOVED_ENTRY);
    const uc = new RemoveFromSuppressionListUseCase(reader, suppressionWriter, auditWriter);

    await expect(
      uc.execute({ id: 'sup-001', actorId: 'admin-1', reason: 'Faux positif confirmé.' }),
    ).rejects.toThrow('already removed');
  });

  it('motif trop court → lève ValidationError', async () => {
    const reader = makeReader(ACTIVE_ENTRY);
    const uc = new RemoveFromSuppressionListUseCase(reader, suppressionWriter, auditWriter);

    await expect(
      uc.execute({ id: 'sup-001', actorId: 'admin-1', reason: 'court' }),
    ).rejects.toThrow('reason');
  });
});
