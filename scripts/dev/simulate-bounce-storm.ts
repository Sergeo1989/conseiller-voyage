#!/usr/bin/env tsx
// T110 — Simuler une tempête de 100 bounces permanents sur 60s.
// Déclenche l'alerte notification_bounce_rate_high (FR-018).
//
// Usage :
//   tsx scripts/dev/simulate-bounce-storm.ts [--count 100] [--delay-ms 600]
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
const COUNT = Number(args[args.indexOf('--count') + 1] || 100);
const DELAY_MS = Number(args[args.indexOf('--delay-ms') + 1] || 600);

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

function makeBounce(i: number): string {
  return JSON.stringify({
    schemaVersion: 1,
    eventType: 'Bounce',
    sesMessageId: `storm-${Date.now()}-${i}`,
    occurredAt: new Date().toISOString(),
    recipientEmail: `bounce-storm-${i}@blackhole.example.com`,
    sourceEmail: 'notifications@notifications.conseiller-voyage.ca',
    details: {
      bounceType: 'Permanent',
      bounceSubType: 'General',
      diagnosticCode: 'smtp; 550 5.1.1 Bounce storm simulation',
      feedbackId: `fb-storm-${Date.now()}-${i}`,
    },
  });
}

async function run(): Promise<void> {
  let ok = 0;
  for (let i = 0; i < COUNT; i++) {
    const status = await post(makeBounce(i));
    if (status === 200) ok++;
    if ((i + 1) % 10 === 0) process.stdout.write(`  ${i + 1}/${COUNT} (${ok} ok)\n`);
    if (i < COUNT - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}

void run();
