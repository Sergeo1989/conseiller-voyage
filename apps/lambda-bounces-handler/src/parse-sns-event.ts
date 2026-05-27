// T081 — Parsing + normalisation des events SES → SNS.
// Cf. contracts/sns-event-schema.md section 2.

export interface NormalizedSesEvent {
  schemaVersion: 1;
  eventType: 'Bounce' | 'Complaint' | 'Delivery';
  sesMessageId: string;
  occurredAt: string;
  recipientEmail: string;
  sourceEmail: string;
  details: BounceDetails | ComplaintDetails | DeliveryDetails;
}

export interface BounceDetails {
  bounceType: 'Permanent' | 'Transient' | 'Undetermined';
  bounceSubType: string;
  diagnosticCode: string | null;
  feedbackId: string;
}

export interface ComplaintDetails {
  complaintFeedbackType: string | null;
  userAgent: string | null;
  feedbackId: string;
}

export interface DeliveryDetails {
  smtpResponse: string;
  processingTimeMillis: number;
}

export class SnsParseError extends Error {
  constructor(
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'SnsParseError';
  }
}

export function parseSnsEvent(rawSnsMessage: string): NormalizedSesEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawSnsMessage) as unknown;
  } catch {
    throw new SnsParseError('Invalid JSON in SNS message body');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new SnsParseError('SNS message is not an object', parsed);
  }

  const msg = parsed as Record<string, unknown>;
  const eventType = msg.eventType as string | undefined;

  if (eventType === 'Bounce') {
    return parseBounce(msg);
  }
  if (eventType === 'Complaint') {
    return parseComplaint(msg);
  }
  if (eventType === 'Delivery') {
    return parseDelivery(msg);
  }

  throw new SnsParseError(`Unknown eventType: ${String(eventType)}`, parsed);
}

function parseMail(msg: Record<string, unknown>): { messageId: string; source: string } {
  const mail = msg.mail as Record<string, unknown> | undefined;
  if (!mail) throw new SnsParseError('Missing mail field');
  const messageId = mail.messageId as string | undefined;
  const source = mail.source as string | undefined;
  if (!messageId) throw new SnsParseError('Missing mail.messageId');
  if (!source) throw new SnsParseError('Missing mail.source');
  return { messageId, source };
}

function parseBounce(msg: Record<string, unknown>): NormalizedSesEvent {
  const { messageId, source } = parseMail(msg);
  const bounce = msg.bounce as Record<string, unknown> | undefined;
  if (!bounce) throw new SnsParseError('Missing bounce field');

  const bouncedRecipients = bounce.bouncedRecipients as Array<Record<string, unknown>> | undefined;
  if (!bouncedRecipients?.length) throw new SnsParseError('Missing bouncedRecipients');

  const recipientEmail = bouncedRecipients[0]?.emailAddress as string | undefined;
  if (!recipientEmail) throw new SnsParseError('Missing bouncedRecipients[0].emailAddress');

  const details: BounceDetails = {
    bounceType: (bounce.bounceType as 'Permanent' | 'Transient' | 'Undetermined') ?? 'Undetermined',
    bounceSubType: (bounce.bounceSubType as string) ?? 'General',
    diagnosticCode: (bouncedRecipients[0]?.diagnosticCode as string | null) ?? null,
    feedbackId: (bounce.feedbackId as string) ?? '',
  };

  return {
    schemaVersion: 1,
    eventType: 'Bounce',
    sesMessageId: messageId,
    occurredAt: (bounce.timestamp as string) ?? new Date().toISOString(),
    recipientEmail,
    sourceEmail: source,
    details,
  };
}

function parseComplaint(msg: Record<string, unknown>): NormalizedSesEvent {
  const { messageId, source } = parseMail(msg);
  const complaint = msg.complaint as Record<string, unknown> | undefined;
  if (!complaint) throw new SnsParseError('Missing complaint field');

  const complainedRecipients = complaint.complainedRecipients as
    | Array<Record<string, unknown>>
    | undefined;
  if (!complainedRecipients?.length) throw new SnsParseError('Missing complainedRecipients');

  const recipientEmail = complainedRecipients[0]?.emailAddress as string | undefined;
  if (!recipientEmail) throw new SnsParseError('Missing complainedRecipients[0].emailAddress');

  const details: ComplaintDetails = {
    complaintFeedbackType: (complaint.complaintFeedbackType as string | null) ?? null,
    userAgent: (complaint.userAgent as string | null) ?? null,
    feedbackId: (complaint.feedbackId as string) ?? '',
  };

  return {
    schemaVersion: 1,
    eventType: 'Complaint',
    sesMessageId: messageId,
    occurredAt: (complaint.timestamp as string) ?? new Date().toISOString(),
    recipientEmail,
    sourceEmail: source,
    details,
  };
}

function parseDelivery(msg: Record<string, unknown>): NormalizedSesEvent {
  const { messageId, source } = parseMail(msg);
  const delivery = msg.delivery as Record<string, unknown> | undefined;
  if (!delivery) throw new SnsParseError('Missing delivery field');

  const recipients = delivery.recipients as string[] | undefined;
  if (!recipients?.length) throw new SnsParseError('Missing delivery.recipients');

  const recipientEmail = recipients[0];
  if (!recipientEmail) throw new SnsParseError('Missing delivery.recipients[0]');

  const details: DeliveryDetails = {
    smtpResponse: (delivery.smtpResponse as string) ?? '',
    processingTimeMillis: (delivery.processingTimeMillis as number) ?? 0,
  };

  return {
    schemaVersion: 1,
    eventType: 'Delivery',
    sesMessageId: messageId,
    occurredAt: (delivery.timestamp as string) ?? new Date().toISOString(),
    recipientEmail,
    sourceEmail: source,
    details,
  };
}
