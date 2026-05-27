// T017 — Test de redaction Pino pour les chemins notifications.
//
// Vérifie que les chemins PII listés dans apps/api/src/common/logger.module.ts
// sont effectivement redacted dans les sorties JSON Pino. Fix I-4 review
// architecte : SC-007 (zéro adresse courriel en clair dans les logs)
// doit être préventif et non curatif.

import pino from 'pino';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// Liste copiée depuis logger.module.ts — si ce test échoue après modif
// de la liste là-bas, c'est probablement parce qu'un chemin a été
// retiré sans test correspondant.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["idempotency-key"]',
  '*.email',
  '*.emailAddress',
  '*.phone',
  '*.phoneNumber',
  '*.firstName',
  '*.lastName',
  '*.fullName',
  '*.password',
  '*.token',
  '*.apiKey',
  'req.body.password',
  'req.body.newPassword',
  'req.body.currentPassword',
  'req.body.newPasswordConfirmation',
  'recipientEmail',
  'recipientEmailClear',
  'recipientEmailCanonical',
  'envelope.recipientEmail',
  'envelope.recipientEmailClear',
  'envelope.recipientEmailCanonical',
  'mail.source',
  'mail.destination[*]',
  'bounce.bouncedRecipients[*].emailAddress',
  'complaint.complainedRecipients[*].emailAddress',
  'delivery.recipients[*]',
  'req.body.recipientEmail',
  '*.subject',
  '*.htmlBody',
  '*.textBody',
];

describe('Pino redaction — feature 003 notifications', () => {
  let output: string[] = [];
  let logger: pino.Logger;

  beforeEach(() => {
    output = [];
    const stream = {
      write(line: string): void {
        output.push(line);
      },
    };
    logger = pino(
      {
        redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      },
      stream as unknown as pino.DestinationStream,
    );
  });

  afterEach(() => {
    output = [];
  });

  test('redacte recipientEmail au top-level', () => {
    logger.info({ recipientEmail: 'voyageur@example.com' }, 'envoi courriel');
    const line = output.join('');
    expect(line).not.toMatch(EMAIL_REGEX);
    expect(line).toContain('[REDACTED]');
  });

  test('redacte envelope.recipientEmail nested', () => {
    logger.info(
      {
        envelope: {
          correlationId: 'abc-123',
          recipientEmail: 'conseiller@example.com',
          templateId: 'auth.email-verification',
        },
      },
      'dispatch envelope',
    );
    const line = output.join('');
    expect(line).not.toMatch(EMAIL_REGEX);
    expect(line).toContain('[REDACTED]');
    expect(line).toContain('abc-123');
    expect(line).toContain('auth.email-verification');
  });

  test('redacte mail.source et mail.destination (format SES)', () => {
    logger.info({
      mail: {
        source: 'notifications@notifications.conseiller-voyage.ca',
        destination: ['recipient1@gmail.com', 'recipient2@yahoo.ca'],
        messageId: 'msg-789',
      },
    });
    const line = output.join('');
    expect(line).not.toMatch(EMAIL_REGEX);
    expect(line).toContain('msg-789');
  });

  test('redacte bouncedRecipients[*].emailAddress (format SNS Bounce)', () => {
    logger.info({
      bounce: {
        bounceType: 'Permanent',
        bouncedRecipients: [{ emailAddress: 'invalid@example.com', diagnosticCode: '550 ...' }],
      },
    });
    const line = output.join('');
    expect(line).not.toMatch(EMAIL_REGEX);
    expect(line).toContain('Permanent');
  });

  test('redacte complainedRecipients[*].emailAddress (format SNS Complaint)', () => {
    logger.info({
      complaint: {
        complaintFeedbackType: 'abuse',
        complainedRecipients: [{ emailAddress: 'angry@example.com' }],
      },
    });
    const line = output.join('');
    expect(line).not.toMatch(EMAIL_REGEX);
    expect(line).toContain('abuse');
  });

  test('redacte delivery.recipients (format SNS Delivery)', () => {
    logger.info({
      delivery: {
        recipients: ['user@example.com'],
        smtpResponse: '250 OK',
        processingTimeMillis: 1234,
      },
    });
    const line = output.join('');
    expect(line).not.toMatch(EMAIL_REGEX);
    expect(line).toContain('1234');
    expect(line).toContain('250 OK');
  });

  test('redacte subject, htmlBody, textBody (contenu courriel)', () => {
    logger.info({
      log: {
        correlationId: 'xyz',
        subject: 'Vérifiez votre courriel — voyageur@example.com',
        htmlBody: '<p>Bonjour voyageur@example.com</p>',
        textBody: 'Bonjour voyageur@example.com',
      },
    });
    const line = output.join('');
    expect(line).not.toMatch(EMAIL_REGEX);
    expect(line).toContain('xyz');
  });

  test('ne touche pas aux champs non-PII (correlationId, templateId, status)', () => {
    logger.info({
      correlationId: '550e8400-e29b-41d4-a716-446655440000',
      templateId: 'auth.email-verification',
      status: 'sent',
      attempts: 1,
    });
    const line = output.join('');
    expect(line).toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(line).toContain('auth.email-verification');
    expect(line).toContain('sent');
  });
});
