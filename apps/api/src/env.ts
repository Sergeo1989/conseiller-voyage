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

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    HOST: z.string().default('0.0.0.0'),

    // Persistence
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    // Stockage objet (AWS S3 ca-central-1 ou LocalStack en dev — ADR-0001)
    AWS_REGION: z.string().default('ca-central-1'),
    AWS_S3_ENDPOINT: z.string().url().optional(),
    AWS_S3_BUCKET_CONFORMITE: z.string().default('cv-conformite-dev'),

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

    // MFA — Clé de chiffrement (KEK) du secret TOTP (feature 005, ADR-0010).
    // 32 octets aléatoires encodés Base64 (= 44 caractères avec padding).
    // En production : valeur provenant d'AWS Secrets Manager ca-central-1.
    // Validation supplémentaire ci-dessous : refuse la KEK de zéros (CI/test)
    // si NODE_ENV=production.
    MFA_KEK_BASE64: z
      .string()
      .min(1, 'MFA_KEK_BASE64 is required (32 random bytes encoded base64)')
      .refine((v) => {
        try {
          return Buffer.from(v, 'base64').length === 32;
        } catch {
          return false;
        }
      }, 'MFA_KEK_BASE64 must decode to exactly 32 bytes (256 bits) of base64'),

    // Auth — Clé de signature des tokens JWT à usage unique (feature 002).
    // 32 octets aléatoires encodés Base64 (= 44 caractères avec padding).
    // Signe les tokens de vérification email, reset password, invitation admin.
    // Mirror du pattern MFA_KEK_BASE64 : refus de zéros en production.
    AUTH_TOKEN_SECRET: z
      .string()
      .min(1, 'AUTH_TOKEN_SECRET is required (32 random bytes encoded base64)')
      .refine((v) => {
        try {
          return Buffer.from(v, 'base64').length === 32;
        } catch {
          return false;
        }
      }, 'AUTH_TOKEN_SECRET must decode to exactly 32 bytes (256 bits) of base64'),

    // Auth — Confiance dans l'en-tête X-Forwarded-For pour l'audit IP (feature 002).
    // En prod derrière CloudFront/ALB : 'true'. En dev local : 'false' (défaut).
    // Cf. apps/api/src/common/actor-ip.util.ts (002a) + research R9.
    TRUSTED_PROXY_HEADERS: z.enum(['true', 'false']).default('false'),

    // Notifications — feature 003 (ADR-0006)
    // Pepper HMAC pour hashage des emails dans la suppression list.
    // En dev : valeur de test quelconque (non vide). En prod : AWS Secrets Manager.
    NOTIFICATIONS_EMAIL_HASH_PEPPER: z.string().min(1).default('dev-pepper-change-me'),
    // HMAC secret partagé avec la Lambda bounces-handler (feature 003).
    NOTIFICATIONS_SNS_HMAC_SECRET: z.string().min(1).default('dev-sns-hmac-change-me'),
    // Adresse expéditeur SES (sous-domaine notifications.conseiller-voyage.ca).
    NOTIFICATIONS_FROM_EMAIL: z
      .string()
      .email()
      .default('notifications@notifications.conseiller-voyage.ca'),
    NOTIFICATIONS_FROM_NAME: z.string().default('Conseiller Voyage'),
    // URL de désabonnement (List-Unsubscribe header, CASL FR-010-b).
    NOTIFICATIONS_UNSUBSCRIBE_URL: z
      .string()
      .url()
      .default('https://conseiller-voyage.ca/unsubscribe'),
    // Nom du Configuration Set SES (notifications-prod | notifications-staging).
    NOTIFICATIONS_SES_CONFIG_SET: z.string().default('notifications-dev'),
  })
  .superRefine((env, ctx) => {
    // T006 — refus de la KEK de test (32 octets de zéro) en production.
    // Cette valeur est utilisée par CI et certains environnements de test
    // pour permettre la reproductibilité des vecteurs ; elle ne doit JAMAIS
    // protéger un secret TOTP réel.
    if (env.NODE_ENV === 'production') {
      const decoded = Buffer.from(env.MFA_KEK_BASE64, 'base64');
      if (decoded.length === 32 && decoded.every((byte) => byte === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MFA_KEK_BASE64'],
          message:
            'MFA_KEK_BASE64 must not be the all-zeros test value in production. ' +
            'Provision a real KEK via AWS Secrets Manager (cv-mfa-kek).',
        });
      }

      // Feature 002 — même garde pour AUTH_TOKEN_SECRET en prod.
      const authSecret = Buffer.from(env.AUTH_TOKEN_SECRET, 'base64');
      if (authSecret.length === 32 && authSecret.every((byte) => byte === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTH_TOKEN_SECRET'],
          message:
            'AUTH_TOKEN_SECRET must not be the all-zeros test value in production. ' +
            'Provision a real secret via AWS Secrets Manager (cv-auth-token-secret).',
        });
      }
    }
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
