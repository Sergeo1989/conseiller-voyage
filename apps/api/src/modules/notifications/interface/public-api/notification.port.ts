// T054 — Facade publique NotificationPort + NotificationPortImpl.
//
// Seule surface exportable cross-module (cf. contracts/notification.port.md).
// tools/check-module-boundaries.ts n'autorise QUE ces symboles depuis l'extérieur.

import type { NotificationEnvelope } from '@cv/shared/notifications';
import { Inject, Injectable } from '@nestjs/common';
import type { ZodIssue } from 'zod';
import {
  ERASE_RECIPIENT_HISTORY_USE_CASE,
  type EraseRecipientHistoryUseCase,
} from '../../application/use-cases/erase-recipient-history.use-case';
import type { SuppressionReason } from '../../domain/enums/suppression-reason.enum';
import {
  SEND_NOTIFICATION_USE_CASE,
  type SendNotificationUseCasePort,
} from './send-notification-use-case.port';

export type SendResult =
  | { accepted: true; notificationLogEntryId: string }
  | { accepted: false; reason: 'duplicate'; notificationLogEntryId: string }
  | { accepted: false; reason: 'suppressed'; suppressionReason: SuppressionReason }
  | { accepted: false; reason: 'rendering_failed'; error: string };

export interface NotificationPort {
  send(envelope: NotificationEnvelope): Promise<SendResult>;
  /**
   * Anonymise tout l'historique d'un destinataire (Loi 25 art. 28.1).
   * Idempotent : un second appel pour le même hash retourne rowsAnonymized=0.
   * Additive — mineur semver (cf. contracts/notification.port.md).
   */
  eraseHistory(emailHashHMAC: string, reason: string): Promise<{ rowsAnonymized: number }>;
}

export const NOTIFICATION_PORT = Symbol('NOTIFICATION_PORT');

export class NotificationEnvelopeValidationError extends Error {
  constructor(public readonly issues: ZodIssue[]) {
    super('NotificationEnvelope failed Zod validation');
    this.name = 'NotificationEnvelopeValidationError';
  }
}

@Injectable()
export class NotificationPortImpl implements NotificationPort {
  constructor(
    @Inject(SEND_NOTIFICATION_USE_CASE)
    private readonly sendNotification: SendNotificationUseCasePort,
    @Inject(ERASE_RECIPIENT_HISTORY_USE_CASE)
    private readonly eraseHistory_: EraseRecipientHistoryUseCase,
  ) {}

  async send(envelope: NotificationEnvelope): Promise<SendResult> {
    return this.sendNotification.execute(envelope);
  }

  async eraseHistory(emailHashHMAC: string, reason: string): Promise<{ rowsAnonymized: number }> {
    return this.eraseHistory_.execute({
      recipientEmailHashHMAC: emailHashHMAC,
      reason,
      requestedAt: new Date(),
    });
  }
}
