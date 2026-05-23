// T015 — Sentry SDK avec scrubbing PII strict (allowlist).
// Cf. ADR-0007 (Sentry self-hosted ca-central-1). Init désactivée si
// SENTRY_DSN absent.

import * as Sentry from '@sentry/nestjs';

// Liste des clés à toujours scrubber, indépendamment de la structure.
// Stratégie défensive : tout champ pouvant contenir du PII identifiable.
const PII_KEYS = new Set([
  'email',
  'emailaddress',
  'mail',
  'phone',
  'phonenumber',
  'telephone',
  'firstname',
  'lastname',
  'fullname',
  'name',
  'address',
  'street',
  'postalcode',
  'zipcode',
  'password',
  'token',
  'apikey',
  'authorization',
]);

const SCRUBBED = '[SCRUBBED]';
const MAX_DEPTH = 8;

function scrubPii(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[MAX_DEPTH]';
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrubPii(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = PII_KEYS.has(key.toLowerCase()) ? SCRUBBED : scrubPii(val, depth + 1);
  }
  return result;
}

interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
}

export function initSentry(config: SentryConfig): void {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.environment === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.data) {
        event.request.data = scrubPii(event.request.data);
      }
      if (event.extra) {
        event.extra = scrubPii(event.extra) as typeof event.extra;
      }
      if (event.contexts) {
        event.contexts = scrubPii(event.contexts) as typeof event.contexts;
      }
      if (event.user) {
        // On ne garde que l'ID (UUID non-identifiant direct) — drop email, ip, name.
        event.user = { id: event.user.id };
      }
      return event;
    },
  });
}
