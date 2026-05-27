// T082 — Lambda handler SES bounces.
//
// Entry point : parse Records[0].Sns.Message → NormalizedSesEvent,
// signe avec HMAC-SHA256 sur `timestamp.body`, POST signé vers l'API.
//
// Variables d'env requises :
//   NOTIFICATIONS_SNS_HMAC_SECRET  — secret partagé avec NestJS
//   NOTIFICATIONS_API_URL          — ex: https://api.conseiller-voyage.ca

import * as crypto from 'node:crypto';
import * as https from 'node:https';
import type { Context, SNSEvent } from 'aws-lambda';
import { type NormalizedSesEvent, parseSnsEvent } from './parse-sns-event';

const HMAC_SECRET = process.env.NOTIFICATIONS_SNS_HMAC_SECRET ?? '';
const API_URL = process.env.NOTIFICATIONS_API_URL ?? '';
const SNS_ENDPOINT_PATH = '/api/internal/notifications/sns';

export async function handler(event: SNSEvent, _context: Context): Promise<void> {
  const record = event.Records[0];
  if (!record) {
    console.warn('No SNS records in event');
    return;
  }

  const rawMessage = record.Sns.Message;
  let normalized: NormalizedSesEvent;
  try {
    normalized = parseSnsEvent(rawMessage);
  } catch (err) {
    console.error('Failed to parse SNS message:', err instanceof Error ? err.message : String(err));
    return;
  }

  const body = JSON.stringify(normalized);
  const timestampSec = Math.floor(Date.now() / 1000).toString();
  const signaturePayload = `${timestampSec}.${body}`;

  const signature = crypto.createHmac('sha256', HMAC_SECRET).update(signaturePayload).digest('hex');

  const signatureHeader = `sha256=${signature}`;

  await postToApi(body, signatureHeader, timestampSec);
}

function postToApi(body: string, signature: string, timestamp: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(SNS_ENDPOINT_PATH, API_URL);
    const options: https.RequestOptions = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port ? Number(url.port) : 443,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-CV-Sns-Signature': signature,
        'X-CV-Sns-Timestamp': timestamp,
      },
    };

    const protocol = url.protocol === 'http:' ? (require('node:http') as typeof https) : https;
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`API returned ${String(res.statusCode)}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
