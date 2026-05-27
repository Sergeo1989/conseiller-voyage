// T084 — SnsWebhookController.
//
// Endpoint POST /api/internal/notifications/sns.
// Reçoit les events SES normalisés depuis la Lambda bounces handler.
// Protégé par SnsWebhookGuard (HMAC + anti-replay).
//
// Cf. contracts/sns-event-schema.md section 3.

import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { z } from 'zod';
import type { RecordBounceUseCase } from '../../application/use-cases/record-bounce.use-case';
import type { RecordComplaintUseCase } from '../../application/use-cases/record-complaint.use-case';
import type { RecordDeliveryUseCase } from '../../application/use-cases/record-delivery.use-case';
import {
  NOTIFICATION_PEPPER_CONFIG,
  type PepperConfig,
} from '../../application/use-cases/send-notification.use-case';
import { canonicalizeEmail } from '../../domain/pure-functions/canonicalize-email';
import { hashRecipientEmail } from '../../domain/pure-functions/hash-recipient-email';
import { SnsWebhookGuard } from './sns-webhook.guard';

// ---------------------------------------------------------------------------
// Schemas Zod (contrat section 3)
// ---------------------------------------------------------------------------

const SnsForwardedBounceSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventType: z.literal('Bounce'),
    sesMessageId: z.string().min(1).max(200),
    occurredAt: z.string().datetime(),
    recipientEmail: z.string().email().max(254),
    sourceEmail: z.string().email().max(254),
    details: z.object({
      bounceType: z.enum(['Permanent', 'Transient', 'Undetermined']),
      bounceSubType: z.string().max(100),
      diagnosticCode: z.string().nullable(),
      feedbackId: z.string().max(200),
    }),
  })
  .strict();

const SnsForwardedComplaintSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventType: z.literal('Complaint'),
    sesMessageId: z.string().min(1).max(200),
    occurredAt: z.string().datetime(),
    recipientEmail: z.string().email().max(254),
    sourceEmail: z.string().email().max(254),
    details: z.object({
      complaintFeedbackType: z.string().nullable(),
      userAgent: z.string().nullable(),
      feedbackId: z.string().max(200),
    }),
  })
  .strict();

const SnsForwardedDeliverySchema = z
  .object({
    schemaVersion: z.literal(1),
    eventType: z.literal('Delivery'),
    sesMessageId: z.string().min(1).max(200),
    occurredAt: z.string().datetime(),
    recipientEmail: z.string().email().max(254),
    sourceEmail: z.string().email().max(254),
    details: z.object({
      smtpResponse: z.string().max(500),
      processingTimeMillis: z.number().int().nonnegative(),
    }),
  })
  .strict();

export const SnsForwardedEventSchema = z.discriminatedUnion('eventType', [
  SnsForwardedBounceSchema,
  SnsForwardedComplaintSchema,
  SnsForwardedDeliverySchema,
]);

export type SnsForwardedEvent = z.infer<typeof SnsForwardedEventSchema>;

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@Controller('api/internal/notifications')
@UseGuards(SnsWebhookGuard)
export class SnsWebhookController {
  constructor(
    private readonly recordBounce: RecordBounceUseCase,
    private readonly recordComplaint: RecordComplaintUseCase,
    private readonly recordDelivery: RecordDeliveryUseCase,
    @Inject(NOTIFICATION_PEPPER_CONFIG) private readonly pepperConfig: PepperConfig,
  ) {}

  @Post('sns')
  @HttpCode(200)
  async handleSnsEvent(@Body() body: unknown): Promise<{ ok: true }> {
    const parsed = SnsForwardedEventSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: true };
    }

    const event = parsed.data;

    if (event.eventType === 'Bounce') {
      const canonical = canonicalizeEmail(event.recipientEmail);
      const hash = hashRecipientEmail(canonical, this.pepperConfig.pepper);
      await this.recordBounce.execute({
        sesMessageId: event.sesMessageId,
        occurredAt: new Date(event.occurredAt),
        recipientEmail: event.recipientEmail,
        recipientEmailHash: hash,
        bounceType: event.details.bounceType,
        bounceSubType: event.details.bounceSubType,
        diagnosticCode: event.details.diagnosticCode,
        feedbackId: event.details.feedbackId,
      });
    } else if (event.eventType === 'Complaint') {
      const canonical = canonicalizeEmail(event.recipientEmail);
      const hash = hashRecipientEmail(canonical, this.pepperConfig.pepper);
      await this.recordComplaint.execute({
        sesMessageId: event.sesMessageId,
        occurredAt: new Date(event.occurredAt),
        recipientEmail: event.recipientEmail,
        recipientEmailHash: hash,
        complaintFeedbackType: event.details.complaintFeedbackType,
        userAgent: event.details.userAgent,
        feedbackId: event.details.feedbackId,
      });
    } else if (event.eventType === 'Delivery') {
      await this.recordDelivery.execute({
        sesMessageId: event.sesMessageId,
        occurredAt: new Date(event.occurredAt),
        recipientEmail: event.recipientEmail,
        smtpResponse: event.details.smtpResponse,
        processingTimeMillis: event.details.processingTimeMillis,
      });
    }

    return { ok: true };
  }
}
