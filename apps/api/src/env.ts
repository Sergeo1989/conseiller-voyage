// T016 — Validation Zod des variables d'environnement, exécutée au boot.
// Crash le process avec un message lisible si une variable est manquante ou mal
// formée. Cf. constitution Principe IX (sécurité applicative) et plan.md
// Technical Context.
//
// Le schéma s'enrichit au fur et à mesure des features :
//   - T017 ajoute AUTH_SECRET, NEXTAUTH_URL
//   - T024 ajoute la config Redis throttler
//   - T026 ajoute AWS_S3_BUCKET, AWS_KMS_KEY_ID
//
// Toute nouvelle variable d'environnement DOIT être déclarée ici.

import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),

  // Persistence
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Stockage objet (AWS S3 ca-central-1 ou LocalStack en dev — ADR-0001)
  AWS_REGION: z.string().default('ca-central-1'),
  AWS_S3_ENDPOINT: z.string().url().optional(),

  // Idempotence (Principe X)
  IDEMPOTENCY_KEY_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),

  // Cache statut conformité (FR-022)
  CONFORMITE_STATUS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  CONFORMITE_PUBSUB_CHANNEL: z.string().default('conformite.status.changed'),

  // Observabilité (Principe VII — ADR-0003)
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('cv-api'),

  // Error tracking (ADR-0007)
  SENTRY_DSN: z.string().url().optional(),

  // Logger
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    process.stderr.write(
      `\n❌ Invalid environment variables:\n${issues}\n\nCheck your .env file or process environment.\n\n`,
    );
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
