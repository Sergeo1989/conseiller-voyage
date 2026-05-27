#!/usr/bin/env tsx
// T110 — Simuler un event plainte ISP (feedback loop abuse) via SNS.
// Déclenche l'alerte notification_complaint_rate_high (FR-019).
//
// Usage :
//   tsx scripts/dev/simulate-complaint.ts [email] [--count N]
//
// Variables d'env :
//   NOTIFICATIONS_SNS_HMAC_SECRET — (défaut : dev-sns-hmac-change-me)
//   NOTIFICATIONS_API_URL         — (défaut : http://localhost:3001)

import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';

const HMAC_SECRET = process.env.NOTIFICATIONS_SNS_HMAC_SECRET ?? 'dev-sns-hmac-change-me';
const API_URL = process.env.NOTIFICATIONS_API_URL ?? 'http://localhost:3001';
const SNS_PATH = '/api/internal/notifications/sns';

const args = process.argv.slice(2);
const targetEmail = args.find((a) => !a.startsWith('--')) ?? 'test+complaint@example.com';
const COUNT = Number(args[args.indexOf('--count') + 1] || 1);

function sign(body: string): { signature: string; timestampSec: string } {
  const timestampSec = Math.floor(Date.now() / 1000).toString();
  const signature = `sha256=${crypto.createHmac('sha256', HMAC_SECRET).update(`${timestampSec}.${body}`).digest('hex')}`;
  return { signature, timestampSec };
}

function post(body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const { signature, timestampSec } = sign(body);
    const url = new URL(SNS_PATH, API_URL);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
        path: url.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-CV-Sns-Signature': signature,
          'X-CV-Sns-Timestamp': timestampSec,
        },
      },
      (res) => {
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function makeComplaint(i: number): string {
  return JSON.stringify({
    schemaVersion: 1,
    eventType: 'Complaint',
    sesMessageId: `complaint-sim-${Date.now()}-${i}`,
    occurredAt: new Date().toISOString(),
    recipientEmail: targetEmail,
    sourceEmail: 'notifications@notifications.conseiller-voyage.ca',
    details: {
      complaintFeedbackType: 'abuse',
      userAgent: 'simulate-complaint/1.0',
      feedbackId: `fb-complaint-${Date.now()}-${i}`,
    },
  });
}

async function run(): Promise<void> {
  for (let i = 0; i < COUNT; i++) {
    const _status = await post(makeComplaint(i));
    if (i < COUNT - 1) await new Promise((r) => setTimeout(r, 200));
  }
}

void run();
