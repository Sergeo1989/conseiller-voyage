// T038 — Port EmailSender.
// Abstrait l'envoi via SES (ou stub mémoire en tests).
// Implémentation concrète : SesEmailSender (T048).

export interface SendEmailInput {
  /** Identifiant outbox source — passé comme SES Outbound Idempotency Token (research R17). */
  readonly correlationId: string;
  readonly fromEmail: string;
  readonly fromName: string;
  readonly recipientEmail: string;
  readonly subject: string;
  readonly htmlBody: string;
  readonly textBody: string;
  /** Headers additionnels — au minimum List-Unsubscribe (FR-010-b). */
  readonly headers: ReadonlyArray<{ readonly name: string; readonly value: string }>;
}

export interface SendEmailResult {
  /** Message-ID retourné par SES, sert à corréler les events SNS. */
  readonly sesMessageId: string;
}

export interface EmailSender {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export const EMAIL_SENDER = Symbol.for('NotificationsEmailSender');
