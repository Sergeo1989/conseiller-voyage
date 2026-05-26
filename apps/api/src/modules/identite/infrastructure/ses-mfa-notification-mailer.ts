// Adapter SES (stub MVP — P1-3 du review).
//
// Pour 005 : écrit dans la table mfa_outbox_emails. Pas d'envoi réel
// tant que 003 n'a pas branché AWS SES + react-email. Le contrat reste
// stable pour faciliter la migration.
//
// Stratégie de retry : géré par 003 quand BullMQ + worker SES seront
// branchés. Pour l'instant, sentAt reste null jusqu'à 003.

import { prisma } from '@cv/db';
import { Injectable, Logger } from '@nestjs/common';
import type {
  AdminResetNoticePayload,
  DeviceChangeIncompleteNoticePayload,
  DeviceChangedNoticePayload,
  LoginLockedNoticePayload,
  MfaNotificationMailer,
  StepUpSessionKilledNoticePayload,
} from '../application/ports/mfa-notification-mailer.port';

type TemplateKind =
  | 'login_locked'
  | 'stepup_session_killed'
  | 'admin_reset'
  | 'device_changed'
  | 'device_change_incomplete';

@Injectable()
export class SesMfaNotificationMailer implements MfaNotificationMailer {
  private readonly logger = new Logger(SesMfaNotificationMailer.name);

  async sendLoginLockedNotice(payload: LoginLockedNoticePayload): Promise<void> {
    await this.enqueue('login_locked', payload.recipientUserId, payload);
  }

  async sendStepUpSessionKilledNotice(payload: StepUpSessionKilledNoticePayload): Promise<void> {
    await this.enqueue('stepup_session_killed', payload.recipientUserId, payload);
  }

  async sendAdminResetNotice(payload: AdminResetNoticePayload): Promise<void> {
    await this.enqueue('admin_reset', payload.recipientUserId, payload);
  }

  async sendDeviceChangedNotice(payload: DeviceChangedNoticePayload): Promise<void> {
    await this.enqueue('device_changed', payload.recipientUserId, payload);
  }

  async sendDeviceChangeIncompleteNotice(
    payload: DeviceChangeIncompleteNoticePayload,
  ): Promise<void> {
    await this.enqueue('device_change_incomplete', payload.recipientUserId, payload);
  }

  private async enqueue(
    templateKind: TemplateKind,
    recipientUserId: string,
    payload: object,
  ): Promise<void> {
    // Sérialisation safe — les Date côté payload sont conservées
    // telles quelles et seront iso-stringifiées par Prisma JSONB.
    await prisma.mfaOutboxEmail.create({
      data: {
        recipientUserId,
        templateKind,
        payload: JSON.parse(JSON.stringify(payload)) as object,
      },
    });
    this.logger.log(`MFA email queued: ${templateKind} → user ${recipientUserId}`);
  }
}
