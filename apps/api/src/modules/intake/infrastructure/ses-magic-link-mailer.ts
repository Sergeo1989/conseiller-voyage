// T053 + T058 [US1] — SesMagicLinkMailer (FR-013 + FR-013a).
//
// Envoie le courriel magic link via AWS SES v2 (ca-central-1 / LocalStack
// en dev). Le HTML est généré par le template react-email
// `@cv/email-templates/intake/magic-link.tsx`. Le plain text est dérivé
// du même contenu pour la compatibilité avec les clients mail texte
// seulement (anti-spam DKIM signe les deux).
//
// Stratégie de retry FR-013a :
//   - La méthode `send()` THROW si SES échoue (5xx/throttle/timeout).
//   - L'orchestrateur SubmitBriefUseCase catch et retourne emailSent=false.
//   - Le job BullMQ `IntakeMagicLinkRetryJob` (T133, Phase 8) sera
//     responsable de rejouer l'envoi avec backoff exponentiel.

import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { MagicLinkEmail } from '@cv/email-templates';
import { Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/render';
import { sesClient } from '../../../aws/clients';
import { env } from '../../../env';
import type { MagicLinkMailer, SendMagicLinkInput } from '../application/ports';

const FROM_ADDRESS = 'intake-noreply@conseiller-voyage.local';
const FROM_ADDRESS_PROD = 'intake-noreply@cv-mail.example.ca';

@Injectable()
export class SesMagicLinkMailer implements MagicLinkMailer {
  private readonly logger = new Logger(SesMagicLinkMailer.name);

  async send(input: SendMagicLinkInput): Promise<void> {
    const sender = env.NODE_ENV === 'production' ? FROM_ADDRESS_PROD : FROM_ADDRESS;
    const subject =
      input.locale === 'fr-CA'
        ? 'Vérifiez votre courriel — Conseiller Voyage'
        : 'Verify your email — Conseiller Voyage';
    const localePath = input.locale === 'fr-CA' ? 'fr' : 'en';
    const verifyUrl = `${env.NEXT_PUBLIC_SITE_URL}/${localePath}/voyage/${input.clearToken}`;

    const html = await render(
      MagicLinkEmail({
        firstName: input.firstName,
        verifyUrl,
        locale: input.locale,
      }),
    );
    const text = await render(
      MagicLinkEmail({
        firstName: input.firstName,
        verifyUrl,
        locale: input.locale,
      }),
      { plainText: true },
    );

    const command = new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: [input.toEmail] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
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
        `SES send failed for brief=${input.briefId} → email retry job will pick up`,
        err,
      );
      throw err;
    }
  }
}
