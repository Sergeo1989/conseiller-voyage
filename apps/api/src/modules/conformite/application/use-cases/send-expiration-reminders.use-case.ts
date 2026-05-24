// T084 — SendExpirationRemindersUseCase (US2 FR-008).
//
// Pour chaque certificat valide qui expire dans EXACTEMENT 60/30/7
// jours à partir de `now`, enqueue une notification au conseiller
// + journalise un AuditEntry + écrit l'événement outbox.
//
// Stratégie de fenêtre temporelle :
//   - On définit fenêtres [now+offset, now+offset+1jour) pour chaque
//     borne 60/30/7. Tout certificat dont expiresAt tombe dans la
//     fenêtre déclenche le rappel correspondant.
//   - Idempotence : le sweep tourne quotidiennement (T086). Si le job
//     échoue et est rejoué le même jour, BullMQ jobId déterministe
//     (`reminder:${certId}:${kind}`) déduplique côté worker.

import type { ConseillerId } from '@cv/shared/conformite';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { AuditEntryToCreate } from '../ports/audit-log-writer.port';
import { AUDIT_LOG_WRITER, type AuditLogWriter } from '../ports/audit-log-writer.port';
import { CONFORMITE_READER, type ConformiteReader } from '../ports/conformite-reader.port';
import { NOTIFICATION_PORT, type NotificationPort } from '../ports/notification.port';
import {
  OUTBOX_WRITER,
  type OutboxEntryToCreate,
  type OutboxWriter,
} from '../ports/outbox-writer.port';

export type ReminderKind = 'reminder_60d' | 'reminder_30d' | 'reminder_7d';

const REMINDER_OFFSETS: ReadonlyArray<{
  kind: ReminderKind;
  days: number;
  eventType: AuditEntryToCreate['eventType'];
}> = [
  { kind: 'reminder_60d', days: 60, eventType: 'expiration.reminder_sent_60d' },
  { kind: 'reminder_30d', days: 30, eventType: 'expiration.reminder_sent_30d' },
  { kind: 'reminder_7d', days: 7, eventType: 'expiration.reminder_sent_7d' },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SendExpirationRemindersInput {
  /**
   * Si non-null, override l'horloge (utile pour rejouer un sweep
   * manuellement sur une date passée). Par défaut clock.now().
   */
  readonly asOf?: Date;
  /**
   * Map conseillerComplianceId → conseillerId pour récupérer le
   * destinataire de la notification. Le caller (T087 fanout) charge
   * cette map en une requête batch.
   */
  readonly conseillerByComplianceId: ReadonlyMap<string, ConseillerId>;
}

export interface SendExpirationRemindersOutput {
  readonly sentCount: number;
  readonly byKind: Readonly<Record<ReminderKind, number>>;
}

@Injectable()
export class SendExpirationRemindersUseCase {
  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    @Inject(AUDIT_LOG_WRITER) private readonly audit: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outbox: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuidGenerator: UuidGenerator,
  ) {}

  async execute(input: SendExpirationRemindersInput): Promise<SendExpirationRemindersOutput> {
    const now = input.asOf ?? this.clock.now();
    const byKind: Record<ReminderKind, number> = {
      reminder_60d: 0,
      reminder_30d: 0,
      reminder_7d: 0,
    };

    for (const offset of REMINDER_OFFSETS) {
      const sent = await this.processBucket(now, offset, input.conseillerByComplianceId);
      byKind[offset.kind] = sent;
    }

    return {
      sentCount: byKind.reminder_60d + byKind.reminder_30d + byKind.reminder_7d,
      byKind,
    };
  }

  private async processBucket(
    now: Date,
    offset: { kind: ReminderKind; days: number; eventType: AuditEntryToCreate['eventType'] },
    conseillerMap: ReadonlyMap<string, ConseillerId>,
  ): Promise<number> {
    const from = new Date(now.getTime() + offset.days * MS_PER_DAY);
    const to = new Date(from.getTime() + MS_PER_DAY);
    const certs = await this.reader.listCertificatsExpiringInWindow(from, to);

    for (const cert of certs) {
      const conseillerId = conseillerMap.get(cert.conseillerComplianceId);
      if (!conseillerId) continue; // safety net : si la map ne contient pas l'ID, on saute

      await this.notifications.enqueue({
        conseillerId,
        kind: 'expiration_reminder',
        payload: {
          certificatId: cert.id,
          expiresAt: cert.expiresAt.toISOString(),
          daysRemaining: offset.days,
        },
      });

      await this.audit.write({
        conseillerComplianceId: cert.conseillerComplianceId,
        eventType: offset.eventType,
        actorId: null,
        actorRole: 'system',
        payload: {
          certificateId: cert.id,
          expiresAt: cert.expiresAt.toISOString(),
        },
        idempotencyKey: `reminder:${cert.id}:${offset.kind}`,
        correlationId: this.uuidGenerator.generate(),
      });

      const outboxEntry: OutboxEntryToCreate = {
        id: this.uuidGenerator.generate(),
        eventType: 'conformite.expiration.reminder_sent',
        payload: {
          conseillerId,
          certificatId: cert.id,
          daysRemaining: offset.days,
          expiresAt: cert.expiresAt.toISOString(),
          occurredAt: now.toISOString(),
        },
      };
      await this.outbox.write(outboxEntry);
    }

    return certs.length;
  }
}
