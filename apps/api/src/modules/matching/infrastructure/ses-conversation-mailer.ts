// T017 (feature 013) — SesConversationMailer.
//
// Résout l'adresse du destinataire au moment de l'envoi (jamais stockée dans
// 013) : conseiller via le module identité (conseillerProfile → authUser),
// voyageur via le module intake (voyageurBrief → voyageurContact). Rend le
// gabarit FR-CA `conversation-new-message` (SANS PII de contenu/contact) et
// envoie via AWS SES ca-central-1.
//
// THROW si SES échoue → le job BullMQ retente (backoff). `skipped_no_address`
// est une issue définitive non bloquante (ex. brief anonymisé Loi 25).

import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { prisma } from '@cv/db';
import { ConversationNewMessageEmail } from '@cv/email-templates';
import { Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/render';
import { sesClient } from '../../../aws/clients';
import { env } from '../../../env';
import type {
  ConversationNotificationMailer,
  SendConversationNotificationInput,
  SendConversationNotificationResult,
} from '../application/ports';

const FROM_ADDRESS = 'conversations-noreply@conseiller-voyage.local';
const FROM_ADDRESS_PROD = 'conversations-noreply@cv-mail.example.ca';

@Injectable()
export class SesConversationMailer implements ConversationNotificationMailer {
  private readonly logger = new Logger(SesConversationMailer.name);

  async sendNewMessage(
    input: SendConversationNotificationInput,
  ): Promise<SendConversationNotificationResult> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      select: { id: true, conseillerId: true, briefId: true },
    });
    if (!conversation) {
      this.logger.warn(`Conversation ${input.conversationId} introuvable — notification ignorée`);
      return { kind: 'skipped_no_address' };
    }

    const email =
      input.recipient === 'conseiller'
        ? await this.resolveConseillerEmail(conversation.conseillerId)
        : await this.resolveVoyageurEmail(conversation.briefId);
    if (!email) {
      this.logger.warn(
        `Adresse ${input.recipient} introuvable pour conversation=${input.conversationId} — notification non bloquante ignorée`,
      );
      return { kind: 'skipped_no_address' };
    }

    const sender = env.NODE_ENV === 'production' ? FROM_ADDRESS_PROD : FROM_ADDRESS;
    const conversationUrl = this.conversationUrl(input.recipient, input.conversationId);
    const props = {
      recipientKind: input.recipient,
      conversationUrl,
      locale: 'fr-CA' as const,
    };
    const html = await render(ConversationNewMessageEmail(props));
    const text = await render(ConversationNewMessageEmail(props), { plainText: true });

    const command = new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: {
            Data: 'Vous avez un nouveau message dans votre conversation',
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
        `SES send failed for conversation=${input.conversationId} (${input.recipient}) → retry job will pick up`,
        err,
      );
      throw err;
    }
    return { kind: 'sent' };
  }

  /** Adresse conseiller (module identité — GRANT SELECT, jamais stockée ici). */
  private async resolveConseillerEmail(conseillerId: string): Promise<string | null> {
    const profile = await prisma.conseillerProfile.findUnique({
      where: { id: conseillerId },
      select: { authUser: { select: { email: true } } },
    });
    return profile?.authUser?.email ?? null;
  }

  /** Adresse voyageur (module intake). Null si brief anonymisé (Loi 25). */
  private async resolveVoyageurEmail(briefId: string | null): Promise<string | null> {
    if (!briefId) return null;
    const brief = await prisma.voyageurBrief.findUnique({
      where: { id: briefId },
      select: { voyageurContact: { select: { email: true } } },
    });
    return brief?.voyageurContact?.email ?? null;
  }

  /**
   * Lien vers l'espace sécurisé. Le tracé exact côté voyageur sera formalisé par
   * 015 ; côté conseiller par 014. URLs stables et neutres en attendant.
   */
  private conversationUrl(recipient: string, conversationId: string): string {
    const base = env.NEXT_PUBLIC_SITE_URL;
    return recipient === 'conseiller'
      ? `${base}/conseiller/conversations/${conversationId}`
      : `${base}/mes-voyages/conversations/${conversationId}`;
  }
}
