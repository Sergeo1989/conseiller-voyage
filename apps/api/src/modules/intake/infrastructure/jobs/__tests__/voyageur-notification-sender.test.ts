// T019 [017 US1] — Tests unitaires VoyageurNotificationSender (branches d'envoi).
// Déterministe (fakes, ni DB ni Redis ni SES) : SES OK → markSent ; SES HS →
// propage (la notification reste en_attente, SC-003) ; sans adresse → markFailed.

import { describe, expect, it } from 'vitest';
import type { Clock } from '../../../../../common/ports/clock.port';
import type {
  SendVoyageurNotificationResult,
  VoyageurNotificationMailer,
  VoyageurNotificationOutbox,
} from '../../../application/ports';
import { VoyageurNotificationSender } from '../voyageur-notification.job';

const NOW = new Date('2026-06-16T12:00:00Z');
const clock: Clock = { now: () => NOW, nowMs: () => NOW.getTime() };

class RecordingOutbox implements Partial<VoyageurNotificationOutbox> {
  sent: Array<{ id: string; at: Date }> = [];
  failed: Array<{ id: string; error: string }> = [];
  markSent(id: string, at: Date): Promise<void> {
    this.sent.push({ id, at });
    return Promise.resolve();
  }
  markFailed(id: string, error: string): Promise<void> {
    this.failed.push({ id, error });
    return Promise.resolve();
  }
}

function makeMailer(behaviour: () => SendVoyageurNotificationResult): VoyageurNotificationMailer {
  return { send: () => Promise.resolve(behaviour()) };
}

const JOB = {
  notificationId: 'n1',
  briefId: 'b1',
  type: 'conseillers_prets' as const,
  outcome: 'matched' as const,
  conseillerIds: ['c1'],
};

describe('VoyageurNotificationSender', () => {
  it('SES OK → markSent', async () => {
    const outbox = new RecordingOutbox();
    const sender = new VoyageurNotificationSender(
      makeMailer(() => ({ kind: 'sent' })),
      outbox as unknown as VoyageurNotificationOutbox,
      clock,
    );
    await sender.send(JOB);
    expect(outbox.sent).toEqual([{ id: 'n1', at: NOW }]);
    expect(outbox.failed).toHaveLength(0);
  });

  it('brief anonymisé → markSent (caduque, non bloquant)', async () => {
    const outbox = new RecordingOutbox();
    const sender = new VoyageurNotificationSender(
      makeMailer(() => ({ kind: 'skipped_anonymized' })),
      outbox as unknown as VoyageurNotificationOutbox,
      clock,
    );
    await sender.send(JOB);
    expect(outbox.sent).toHaveLength(1);
  });

  it('sans adresse → markFailed (no_address)', async () => {
    const outbox = new RecordingOutbox();
    const sender = new VoyageurNotificationSender(
      makeMailer(() => ({ kind: 'skipped_no_address' })),
      outbox as unknown as VoyageurNotificationOutbox,
      clock,
    );
    await sender.send(JOB);
    expect(outbox.failed).toEqual([{ id: 'n1', error: 'no_address' }]);
    expect(outbox.sent).toHaveLength(0);
  });

  it('SES HS → propage l’erreur, aucune marque (reste en_attente, SC-003)', async () => {
    const outbox = new RecordingOutbox();
    const sender = new VoyageurNotificationSender(
      { send: () => Promise.reject(new Error('SES 503')) },
      outbox as unknown as VoyageurNotificationOutbox,
      clock,
    );
    await expect(sender.send(JOB)).rejects.toThrow('SES 503');
    expect(outbox.sent).toHaveLength(0);
    expect(outbox.failed).toHaveLength(0);
  });
});
