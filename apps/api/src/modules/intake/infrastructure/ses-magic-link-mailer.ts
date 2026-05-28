// T053 [US1] — SesMagicLinkMailer (FR-013 + FR-013a).
//
// Envoie le courriel magic link via AWS SES v2 (ca-central-1 / LocalStack
// en dev). Le template react-email viendra en T058 (`packages/email-
// templates/intake/magic-link.tsx`) — pour l'instant, on génère un body
// inline FR-CA / EN simple, suffisant pour démontrer le flow end-to-end.
//
// Stratégie de retry FR-013a :
//   - La méthode `send()` THROW si SES échoue (5xx/throttle/timeout).
//   - L'orchestrateur SubmitBriefUseCase catch et retourne emailSent=false.
//   - Le job BullMQ `IntakeMagicLinkRetryJob` (T133, Phase 8) sera
//     responsable de rejouer l'envoi avec backoff exponentiel.

import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Injectable, Logger } from '@nestjs/common';
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
    const link = `${env.NEXT_PUBLIC_SITE_URL}/${input.locale === 'fr-CA' ? 'fr' : 'en'}/voyage/${input.clearToken}`;

    const command = new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: [input.toEmail] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: renderHtml(input, link), Charset: 'UTF-8' },
            Text: { Data: renderText(input, link), Charset: 'UTF-8' },
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

function renderHtml(input: SendMagicLinkInput, link: string): string {
  if (input.locale === 'fr-CA') {
    return `
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;">
  <p>Bonjour ${escapeHtml(input.firstName)},</p>
  <p>Pour valider votre demande de voyage et permettre à un conseiller vérifié de vous contacter, cliquez sur le lien ci-dessous (valide 7 jours) :</p>
  <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:6px;">Confirmer mon courriel</a></p>
  <p style="color:#666;font-size:0.875rem;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>${link}</p>
  <p style="color:#666;font-size:0.875rem;">Vous n'avez pas demandé ce courriel ? Ignorez-le simplement, aucune action ne sera prise.</p>
  <hr/>
  <p style="color:#888;font-size:0.75rem;">Conseiller Voyage — service de mise en relation avec des conseillers vérifiés OPC/TICO au Canada.</p>
</body>
</html>`;
  }
  return `
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a;">
  <p>Hi ${escapeHtml(input.firstName)},</p>
  <p>To confirm your travel request and allow a verified advisor to contact you, click the link below (valid for 7 days):</p>
  <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:6px;">Verify my email</a></p>
  <p style="color:#666;font-size:0.875rem;">If the button doesn't work, copy this link into your browser:<br/>${link}</p>
  <p style="color:#666;font-size:0.875rem;">Didn't request this email? Just ignore it — no action will be taken.</p>
  <hr/>
  <p style="color:#888;font-size:0.75rem;">Conseiller Voyage — connecting Canadian travelers with OPC/TICO-verified advisors.</p>
</body>
</html>`;
}

function renderText(input: SendMagicLinkInput, link: string): string {
  if (input.locale === 'fr-CA') {
    return `Bonjour ${input.firstName},\n\nValidez votre demande en cliquant : ${link}\n\nLien valide 7 jours. Vous n'avez pas fait cette demande ? Ignorez ce courriel.\n\nConseiller Voyage`;
  }
  return `Hi ${input.firstName},\n\nConfirm your request: ${link}\n\nLink valid for 7 days. Didn't request this? Just ignore.\n\nConseiller Voyage`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
