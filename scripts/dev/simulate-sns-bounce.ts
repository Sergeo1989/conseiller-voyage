#!/usr/bin/env tsx
// T095 — Script dev : simuler un event SNS SES bounce → POST signé HMAC.
//
// Usage :
//   tsx scripts/dev/simulate-sns-bounce.ts [bounce|complaint|delivery] [email]
//
// Variables d'env requises :
//   NOTIFICATIONS_SNS_HMAC_SECRET — secret partagé (défaut : dev-sns-hmac-change-me)
//   NOTIFICATIONS_API_URL         — URL de l'API (défaut : http://localhost:3001)

import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';

const HMAC_SECRET = process.env.NOTIFICATIONS_SNS_HMAC_SECRET ?? 'dev-sns-hmac-change-me';
const API_URL = process.env.NOTIFICATIONS_API_URL ?? 'http://localhost:3001';
const SNS_ENDPOINT_PATH = '/api/internal/notifications/sns';

const eventType = (process.argv[2] ?? 'bounce') as 'bounce' | 'complaint' | 'delivery';
const targetEmail = process.argv[3] ?? 'test+bounce@example.com';

const now = new Date().toISOString();
const sesMessageId = `simulate-${Date.now()}`;

function makePayload(): object {
  if (eventType === 'bounce') {
    return {
      schemaVersion: 1,
      eventType: 'Bounce',
      sesMessageId,
      occurredAt: now,
      recipientEmail: targetEmail,
      sourceEmail: 'notifications@notifications.conseiller-voyage.ca',
      details: {
        bounceType: 'Permanent',
        bounceSubType: 'General',
        diagnosticCode: 'smtp; 550 5.1.1 The email account does not exist',
        feedbackId: `fb-${sesMessageId}`,
      },
    };
  }
  if (eventType === 'complaint') {
    return {
      schemaVersion: 1,
      eventType: 'Complaint',
      sesMessageId,
      occurredAt: now,
      recipientEmail: targetEmail,
      sourceEmail: 'notifications@notifications.conseiller-voyage.ca',
      details: {
        complaintFeedbackType: 'abuse',
        userAgent: 'simulate-script',
        feedbackId: `fb-${sesMessageId}`,
      },
    };
  }
  return {
    schemaVersion: 1,
    eventType: 'Delivery',
    sesMessageId,
    occurredAt: now,
    recipientEmail: targetEmail,
    sourceEmail: 'notifications@notifications.conseiller-voyage.ca',
    details: {
      smtpResponse: '250 2.0.0 OK (simulated)',
      processingTimeMillis: 1234,
    },
  };
}

const body = JSON.stringify(makePayload());
const timestampSec = Math.floor(Date.now() / 1000).toString();
const signaturePayload = `${timestampSec}.${body}`;
const signature = `sha256=${crypto.createHmac('sha256', HMAC_SECRET).update(signaturePayload).digest('hex')}`;

const url = new URL(SNS_ENDPOINT_PATH, API_URL);
const isHttps = url.protocol === 'https:';
const transport = isHttps ? https : http;
const options: http.RequestOptions = {
  method: 'POST',
  hostname: url.hostname,
  port: url.port ? Number(url.port) : isHttps ? 443 : 80,
  path: url.pathname,
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-CV-Sns-Signature': signature,
    'X-CV-Sns-Timestamp': timestampSec,
  },
};

const req = transport.request(options, (res) => {
  let _data = '';
  res.on('data', (chunk: Buffer) => {
    _data += chunk.toString();
  });
  res.on('end', () => {});
});

req.on('error', (err: Error) => {
  console.error('Request failed:', err.message);
  process.exit(1);
});

req.write(body);
req.end();
