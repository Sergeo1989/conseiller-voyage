// T048 — SesEmailSender.
//
// Envoie via @aws-sdk/client-sesv2 :
//   - correlationId propagé via EmailTags (capturé par le ConfigurationSet
//     event destination — queryable dans CloudTrail/CloudWatch).
//   - Headers List-Unsubscribe + List-Unsubscribe-Post: One-Click (FR-010-b).
//   - ConfigurationSetName = notifications-prod ou notifications-staging selon env.
//   - Circuit breaker custom via computeCircuitState (état en mémoire process).
//
// L'idempotence des envois est garantie en amont par l'unicité de
// `notification_email_log.correlationId` (insert idempotent — cf.
// PrismaNotificationLog) ; SES SendEmail v2 n'expose pas de ClientToken.
//
// Cf. ADR-0006.

import { type SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  EmailSender,
  SendEmailInput,
  SendEmailResult,
} from '../application/ports/email-sender.port';
import {
  type CircuitState,
  INITIAL_CIRCUIT_STATE,
  computeCircuitState,
  isCallAllowed,
} from '../domain/pure-functions/compute-circuit-state';
import { emailSentCounter } from './notifications-metrics';

export const SES_CLIENT = Symbol.for('NotificationsSesClient');
export const SES_CONFIG_SET_NAME = Symbol.for('NotificationsSesConfigSetName');
export const SES_UNSUBSCRIBE_URL = Symbol.for('NotificationsSesUnsubscribeUrl');

@Injectable()
export class SesEmailSender implements EmailSender {
  private readonly logger = new Logger(SesEmailSender.name);
  private circuitState: CircuitState = INITIAL_CIRCUIT_STATE;

  constructor(
    @Inject(SES_CLIENT) private readonly sesClient: SESv2Client,
    @Inject(SES_CONFIG_SET_NAME) private readonly configSetName: string,
    @Inject(SES_UNSUBSCRIBE_URL) private readonly unsubscribeUrl: string,
  ) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const now = new Date();
    if (!isCallAllowed(this.circuitState, now)) {
      throw new Error('SES circuit breaker OPEN — aborting send');
    }

    const command = new SendEmailCommand({
      FromEmailAddress: `${input.fromName} <${input.fromEmail}>`,
      Destination: { ToAddresses: [input.recipientEmail] },
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: input.htmlBody, Charset: 'UTF-8' },
            Text: { Data: input.textBody, Charset: 'UTF-8' },
          },
          Headers: [
            { Name: 'List-Unsubscribe', Value: `<${this.unsubscribeUrl}>` },
            { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
            ...input.headers.map((h) => ({ Name: h.name, Value: h.value })),
          ],
        },
      },
      ConfigurationSetName: this.configSetName,
      EmailTags: [{ Name: 'correlation-id', Value: input.correlationId }],
    });

    try {
      const response = await this.sesClient.send(command);
      this.circuitState = computeCircuitState(this.circuitState, { type: 'success' }, new Date());
      emailSentCounter.add(1, {
        template_id: input.labels?.templateId ?? 'unknown',
        locale: input.labels?.locale ?? 'unknown',
        source_module: input.labels?.sourceModule ?? 'unknown',
      });
      return { sesMessageId: response.MessageId ?? '' };
    } catch (err) {
      this.circuitState = computeCircuitState(this.circuitState, { type: 'failure' }, new Date());
      if (this.circuitState.kind === 'open') {
        this.logger.error(`SES circuit breaker OPENED after failure: ${String(err)}`);
      }
      throw err;
    }
  }
}
