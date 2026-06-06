// T028 [US1] — SesLeadNotificationMailer.
//
// Résout l'adresse + le prénom du conseiller via le module identité (auth_users
// joint au profil — GRANT SELECT cross-module, jamais stockés dans 012),
// re-vérifie `verified` (FR-008), rend le gabarit FR-CA `lead-received.tsx`
// (sans PII de contact voyageur) et envoie via AWS SES ca-central-1.
//
// THROW si SES échoue (5xx/throttle/timeout) → le job BullMQ retente (backoff).
// Les cas `skipped_*` sont des issues définitives non bloquantes.

import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { prisma } from '@cv/db';
import { LeadReceivedEmail } from '@cv/email-templates';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/render';
import { sesClient } from '../../../aws/clients';
import { env } from '../../../env';
import type {
  LeadNotificationMailer,
  SendLeadReceivedInput,
  SendLeadReceivedResult,
} from '../application/ports';

const FROM_ADDRESS = 'leads-noreply@conseiller-voyage.local';
const FROM_ADDRESS_PROD = 'leads-noreply@cv-mail.example.ca';

@Injectable()
export class SesLeadNotificationMailer implements LeadNotificationMailer {
  private readonly logger = new Logger(SesLeadNotificationMailer.name);

  constructor(
    @Inject(CONFORMITE_QUERY_PORT)
    private readonly conformiteQuery: ConformiteQueryPort,
  ) {}

  async sendLeadReceived(input: SendLeadReceivedInput): Promise<SendLeadReceivedResult> {
    // Re-check verified au moment de l'envoi (FR-008).
    const status = await this.conformiteQuery.getVerificationStatus({
      conseillerId: input.conseillerId,
      strict: true,
    });
    if (!status.verified) return { kind: 'skipped_unverified' };

    // Résolution adresse + prénom (jamais stockés dans 012).
    const profile = await prisma.conseillerProfile.findUnique({
      where: { id: input.conseillerId },
      select: { authUser: { select: { email: true, firstName: true } } },
    });
    const email = profile?.authUser?.email ?? null;
    if (!email) {
      this.logger.warn(
        `Adresse introuvable pour conseiller=${input.conseillerId} — notification non bloquante ignorée`,
      );
      return { kind: 'skipped_no_address' };
    }

    const firstName = profile?.authUser?.firstName ?? 'conseiller';
    const sender = env.NODE_ENV === 'production' ? FROM_ADDRESS_PROD : FROM_ADDRESS;
    const leadUrl = `${env.NEXT_PUBLIC_SITE_URL}/conseiller/leads/${input.leadId}`;

    const props = {
      firstName,
      briefSummary: {
        destinations: input.briefSummary.destinations,
        periodeApprox: input.briefSummary.periodeApprox,
        typeProjet: input.briefSummary.typeProjet,
      },
      leadUrl,
      locale: 'fr-CA' as const,
    };
    const html = await render(LeadReceivedEmail(props));
    const text = await render(LeadReceivedEmail(props), { plainText: true });

    const command = new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: {
            Data: 'Un nouveau projet de voyage correspond à votre profil',
            Charset: 'UTF-8',
          },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' },
          },
        },
      },
    });

    try {
      await sesClient.send(command);
    } catch (err) {
      this.logger.error(
        `SES send failed for lead=${input.leadId} → notification retry job will pick up`,
        err,
      );
      throw err;
    }
    return { kind: 'sent' };
  }
}
