// T083 — Tests Vitest parse-sns-event.ts (RED → GREEN).
// Fixtures : bounce permanent/transient, complaint, delivery.

import { describe, expect, it } from 'vitest';
import { SnsParseError, parseSnsEvent } from '../parse-sns-event';

const BOUNCE_PERMANENT = JSON.stringify({
  eventType: 'Bounce',
  mail: {
    timestamp: '2026-05-26T10:00:01.000Z',
    messageId: 'msg-001',
    source: 'notifications@notifications.conseiller-voyage.ca',
    destination: ['user@example.com'],
  },
  bounce: {
    bounceType: 'Permanent',
    bounceSubType: 'General',
    bouncedRecipients: [
      {
        emailAddress: 'user@example.com',
        action: 'failed',
        status: '5.1.1',
        diagnosticCode: 'smtp; 550 5.1.1 The email account does not exist',
      },
    ],
    timestamp: '2026-05-26T10:01:00.000Z',
    feedbackId: 'fb-001',
  },
});

const BOUNCE_TRANSIENT = JSON.stringify({
  eventType: 'Bounce',
  mail: {
    timestamp: '2026-05-26T10:00:01.000Z',
    messageId: 'msg-002',
    source: 'notifications@notifications.conseiller-voyage.ca',
    destination: ['soft@example.com'],
  },
  bounce: {
    bounceType: 'Transient',
    bounceSubType: 'MailboxFull',
    bouncedRecipients: [{ emailAddress: 'soft@example.com', diagnosticCode: null }],
    timestamp: '2026-05-26T10:01:00.000Z',
    feedbackId: 'fb-002',
  },
});

const COMPLAINT = JSON.stringify({
  eventType: 'Complaint',
  mail: {
    timestamp: '2026-05-26T10:00:01.000Z',
    messageId: 'msg-003',
    source: 'notifications@notifications.conseiller-voyage.ca',
    destination: ['complainer@example.com'],
  },
  complaint: {
    complainedRecipients: [{ emailAddress: 'complainer@example.com' }],
    timestamp: '2026-05-26T10:05:00.000Z',
    feedbackId: 'fb-003',
    complaintFeedbackType: 'abuse',
    userAgent: 'Gmail',
  },
});

const DELIVERY = JSON.stringify({
  eventType: 'Delivery',
  mail: {
    timestamp: '2026-05-26T10:00:01.000Z',
    messageId: 'msg-004',
    source: 'notifications@notifications.conseiller-voyage.ca',
    destination: ['delivered@example.com'],
  },
  delivery: {
    timestamp: '2026-05-26T10:00:18.890Z',
    processingTimeMillis: 17890,
    recipients: ['delivered@example.com'],
    smtpResponse: '250 2.0.0 OK  1748249818 sm1-20020a17090b2c2100b003083ed18dcf',
  },
});

describe('parseSnsEvent', () => {
  describe('Bounce permanent', () => {
    it('parses all fields correctly', () => {
      const result = parseSnsEvent(BOUNCE_PERMANENT);
      expect(result.schemaVersion).toBe(1);
      expect(result.eventType).toBe('Bounce');
      expect(result.sesMessageId).toBe('msg-001');
      expect(result.occurredAt).toBe('2026-05-26T10:01:00.000Z');
      expect(result.recipientEmail).toBe('user@example.com');
      expect(result.sourceEmail).toBe('notifications@notifications.conseiller-voyage.ca');
      expect(result.details).toMatchObject({
        bounceType: 'Permanent',
        bounceSubType: 'General',
        feedbackId: 'fb-001',
        diagnosticCode: 'smtp; 550 5.1.1 The email account does not exist',
      });
    });
  });

  describe('Bounce transient', () => {
    it('parses bounceType Transient', () => {
      const result = parseSnsEvent(BOUNCE_TRANSIENT);
      expect(result.eventType).toBe('Bounce');
      if (result.eventType === 'Bounce') {
        expect((result.details as { bounceType: string }).bounceType).toBe('Transient');
      }
      expect(result.recipientEmail).toBe('soft@example.com');
    });
  });

  describe('Complaint', () => {
    it('parses all complaint fields', () => {
      const result = parseSnsEvent(COMPLAINT);
      expect(result.schemaVersion).toBe(1);
      expect(result.eventType).toBe('Complaint');
      expect(result.sesMessageId).toBe('msg-003');
      expect(result.recipientEmail).toBe('complainer@example.com');
      expect(result.details).toMatchObject({
        complaintFeedbackType: 'abuse',
        userAgent: 'Gmail',
        feedbackId: 'fb-003',
      });
    });
  });

  describe('Delivery', () => {
    it('parses delivery event', () => {
      const result = parseSnsEvent(DELIVERY);
      expect(result.eventType).toBe('Delivery');
      expect(result.sesMessageId).toBe('msg-004');
      expect(result.recipientEmail).toBe('delivered@example.com');
      expect(result.details).toMatchObject({
        smtpResponse: '250 2.0.0 OK  1748249818 sm1-20020a17090b2c2100b003083ed18dcf',
        processingTimeMillis: 17890,
      });
    });
  });

  describe('Error cases', () => {
    it('throws SnsParseError for invalid JSON', () => {
      expect(() => parseSnsEvent('not-json')).toThrow(SnsParseError);
    });

    it('throws SnsParseError for unknown eventType', () => {
      expect(() => parseSnsEvent(JSON.stringify({ eventType: 'Unknown' }))).toThrow(SnsParseError);
    });

    it('throws SnsParseError for missing mail field', () => {
      expect(() => parseSnsEvent(JSON.stringify({ eventType: 'Bounce', bounce: {} }))).toThrow(
        SnsParseError,
      );
    });
  });
});
