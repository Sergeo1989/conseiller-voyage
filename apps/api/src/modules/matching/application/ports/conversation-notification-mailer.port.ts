// T017 (feature 013) — Port ConversationNotificationMailer.
//
// Envoie « vous avez un nouveau message » au destinataire (FR-CA, SANS PII de
// contenu ni de contact — FR-003). Résout l'adresse via lecture cross-module
// (conseiller → identité ; voyageur → intake) au moment de l'envoi, jamais
// stockée dans 013. THROW si SES échoue (→ retry BullMQ).

import type { ConversationParticipant } from '@cv/shared/matching';

export interface SendConversationNotificationInput {
  readonly conversationId: string;
  readonly recipient: ConversationParticipant;
}

export type SendConversationNotificationResult =
  | { readonly kind: 'sent' }
  | { readonly kind: 'skipped_no_address' };

export interface ConversationNotificationMailer {
  sendNewMessage(
    input: SendConversationNotificationInput,
  ): Promise<SendConversationNotificationResult>;
}

export const CONVERSATION_NOTIFICATION_MAILER = Symbol.for('ConversationNotificationMailer');
