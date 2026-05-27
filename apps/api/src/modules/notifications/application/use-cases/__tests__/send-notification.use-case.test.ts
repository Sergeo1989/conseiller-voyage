// T045 — Tests RED pour SendNotificationUseCase.
//
// Trois scénarios contractuels (cf. contracts/notification.port.md) :
//   1. Envelope valide → enqueue BullMQ + insert log → accepted: true.
//   2. Envelope dupliquée (même correlationId) → no-op → accepted: false, reason: duplicate.
//   3. Destinataire en suppression list → skip → accepted: false, reason: suppressed.

import { randomUUID } from 'node:crypto';
import type { NotificationEnvelope } from '@cv/shared/notifications';
import { type MockInstance, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SuppressionListEntry } from '../../../domain/entities/suppression-list-entry.entity';
import type { NotificationAuditLogWriter } from '../../ports/notification-audit-log-writer.port';
import type {
  InsertLogInput,
  NotificationLogWriter,
} from '../../ports/notification-log-writer.port';
import type { SuppressionListReader } from '../../ports/suppression-list-reader.port';
import { type EnqueueFn, SendNotificationUseCase } from '../send-notification.use-case';

const makeEnvelope = (overrides?: Partial<NotificationEnvelope>): NotificationEnvelope => ({
  schemaVersion: 1,
  correlationId: randomUUID(),
  eventType: 'auth.email_verification',
  templateId: 'auth.email-verification',
  recipientEmail: 'conseiller@example.com',
  recipientLocale: 'fr-CA',
  templateData: { firstName: 'Alice', verifyUrl: 'https://example.com/verify' },
  sourceModule: 'identite',
  enqueuedAt: new Date().toISOString(),
  ...overrides,
});

const makeSuppressionEntry = (overrides?: Partial<SuppressionListEntry>): SuppressionListEntry => ({
  id: randomUUID(),
  recipientEmailHashHMAC: 'some-hash',
  reason: 'hard_bounce',
  source: 'ses_sns_bounce',
  details: null,
  addedAt: new Date(),
  expiresAt: null,
  removedAt: null,
  removedByActorId: null,
  removedReason: null,
  ...overrides,
});

describe('SendNotificationUseCase', () => {
  let logWriter: {
    insert: MockInstance;
    updateStatus: MockInstance;
    anonymizeByEmailHash: MockInstance;
  };
  let suppressionReader: {
    findByEmailHash: MockInstance;
    list: MockInstance;
  };
  let auditWriter: {
    append: MockInstance;
  };
  let enqueueFn: MockInstance;
  let useCase: SendNotificationUseCase;

  beforeEach(() => {
    logWriter = {
      insert: vi.fn(),
      updateStatus: vi.fn(),
      anonymizeByEmailHash: vi.fn(),
    };
    suppressionReader = {
      findByEmailHash: vi.fn(),
      list: vi.fn(),
    };
    auditWriter = {
      append: vi.fn(),
    };
    enqueueFn = vi.fn();

    useCase = new SendNotificationUseCase(
      logWriter as unknown as NotificationLogWriter,
      suppressionReader as unknown as SuppressionListReader,
      auditWriter as unknown as NotificationAuditLogWriter,
      enqueueFn as unknown as EnqueueFn,
      { pepper: 'test-pepper-base64', historicalPeppers: [] },
    );
  });

  describe('Scénario 1 — envelope valide', () => {
    it('insère le log et enqueue si suppression list vide', async () => {
      const envelope = makeEnvelope();
      const logId = randomUUID();

      suppressionReader.findByEmailHash.mockResolvedValue(null);
      logWriter.insert.mockResolvedValue({ id: logId, created: true });
      enqueueFn.mockResolvedValue(undefined);

      const result = await useCase.execute(envelope);

      expect(result).toEqual({ accepted: true, notificationLogEntryId: logId });
      expect(suppressionReader.findByEmailHash).toHaveBeenCalledOnce();
      expect(logWriter.insert).toHaveBeenCalledOnce();
      const insertArg = logWriter.insert.mock.calls[0]?.[0] as InsertLogInput;
      expect(insertArg.correlationId).toBe(envelope.correlationId);
      expect(insertArg.status).toBe('queued');
      expect(enqueueFn).toHaveBeenCalledOnce();
    });
  });

  describe('Scénario 2 — envelope dupliquée', () => {
    it('retourne duplicate si correlationId déjà connu (insert retourne created: false)', async () => {
      const envelope = makeEnvelope();
      const logId = randomUUID();

      suppressionReader.findByEmailHash.mockResolvedValue(null);
      logWriter.insert.mockResolvedValue({ id: logId, created: false });

      const result = await useCase.execute(envelope);

      expect(result).toEqual({
        accepted: false,
        reason: 'duplicate',
        notificationLogEntryId: logId,
      });
      expect(enqueueFn).not.toHaveBeenCalled();
    });
  });

  describe('Scénario 3 — destinataire supprimé', () => {
    it('retourne suppressed et ne crée pas de log si entry active', async () => {
      const envelope = makeEnvelope();
      const entry = makeSuppressionEntry({ expiresAt: null, removedAt: null });

      suppressionReader.findByEmailHash.mockResolvedValue(entry);

      const result = await useCase.execute(envelope);

      expect(result).toEqual({
        accepted: false,
        reason: 'suppressed',
        suppressionReason: 'hard_bounce',
      });
      expect(logWriter.insert).not.toHaveBeenCalled();
      expect(enqueueFn).not.toHaveBeenCalled();
    });

    it('accepte si entry suppression expirée', async () => {
      const envelope = makeEnvelope();
      const logId = randomUUID();
      const expiredEntry = makeSuppressionEntry({
        expiresAt: new Date(Date.now() - 1000),
        removedAt: null,
      });

      suppressionReader.findByEmailHash.mockResolvedValue(expiredEntry);
      logWriter.insert.mockResolvedValue({ id: logId, created: true });
      enqueueFn.mockResolvedValue(undefined);

      const result = await useCase.execute(envelope);

      expect(result).toEqual({ accepted: true, notificationLogEntryId: logId });
    });

    it('accepte si entry retirée par admin (removedAt non-null)', async () => {
      const envelope = makeEnvelope();
      const logId = randomUUID();
      const removedEntry = makeSuppressionEntry({
        removedAt: new Date(),
      });

      suppressionReader.findByEmailHash.mockResolvedValue(removedEntry);
      logWriter.insert.mockResolvedValue({ id: logId, created: true });
      enqueueFn.mockResolvedValue(undefined);

      const result = await useCase.execute(envelope);

      expect(result).toEqual({ accepted: true, notificationLogEntryId: logId });
    });
  });

  describe('Validation Zod', () => {
    it('lève NotificationEnvelopeValidationError si envelope invalide', async () => {
      const { NotificationEnvelopeValidationError } = await import('@cv/shared/notifications');
      const badEnvelope = {
        schemaVersion: 1,
        correlationId: 'not-a-uuid',
      } as unknown as NotificationEnvelope;

      await expect(useCase.execute(badEnvelope)).rejects.toBeInstanceOf(
        NotificationEnvelopeValidationError,
      );
    });
  });
});
