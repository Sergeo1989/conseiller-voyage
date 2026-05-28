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

    // Feature 007 — bucket photos profil + CloudFront OAC (cf. R2 / M7)
    AWS_S3_BUCKET_PROFILES: z.string().default('cv-profiles-photos-dev'),
    AWS_KMS_PROFILES_KEY_ID: z.string().optional(),
    /** URL publique CloudFront pour servir les photos profil (cacheable browser/CDN long terme). */
    CLOUDFRONT_PROFILES_PUBLIC_URL: z
      .string()
      .url()
      .default('http://localhost:4566/cv-profiles-photos-dev'),
    /** Distribution ID pour les invalidations CDN cross-cache (FR-014 + C2). */
    CLOUDFRONT_PROFILES_DISTRIBUTION_ID: z.string().optional(),

    // Feature 007 — cookie HMAC du `?suggested=` (FR-008a)
    CV_SUGGESTED_COOKIE_SECRET: z
      .string()
      .min(32, 'CV_SUGGESTED_COOKIE_SECRET doit faire au moins 32 octets')
      .default('dev-only-32-bytes-not-for-production-x'),
    /** Bearer secret pour l'endpoint Next.js /api/revalidate. */
    CV_REVALIDATE_SECRET: z
      .string()
      .min(16, 'CV_REVALIDATE_SECRET doit faire au moins 16 octets')
      .default('dev-only-revalidate-secret-xxxx'),
    /** URL publique Next.js — base pour les invalidations. */
    NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),

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

    // ── Intake (feature 002-voyageur-intake) ─────────────────────────
    // T006 — 5 env vars du module intake. Voir
    // docs/runbooks/intake-secrets-rotation.md (T008) pour la rotation.

    /** Secret HMAC SHA-256 du magic link voyageur (R1). 32+ octets en prod. */
    INTAKE_MAGIC_LINK_SECRET: z
      .string()
      .min(32, 'INTAKE_MAGIC_LINK_SECRET doit faire au moins 32 octets')
      .default('dev-only-intake-magic-link-secret-32b'),

    /** Intervalle (heures) entre 2 refresh du snapshot Redis disposable-emails (R3). */
    INTAKE_DISPOSABLE_EMAILS_REFRESH_INTERVAL_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .default(168), // 7 jours

    /** Plafond email-scoped (FR-019). Au-delà → 429 EMAIL_RATE_LIMIT_EXCEEDED. */
    INTAKE_RATE_LIMIT_EMAIL_PER_24H: z.coerce.number().int().positive().default(3),

    /** Plafond IP-scoped (FR-020). Au-delà → 429 RATE_LIMIT_EXCEEDED (neutre). */
    INTAKE_RATE_LIMIT_IP_PER_24H: z.coerce.number().int().positive().default(5),

    /** Durée de vie d'un brief actif (FR-024). À J+N : anonymisation Loi 25. */
    INTAKE_BRIEF_EXPIRATION_DAYS: z.coerce.number().int().positive().default(90),
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

      // T006 (feature 002-voyageur-intake) — refus du secret intake dev en prod.
      // Le default 'dev-only-intake-magic-link-secret-32b' permet le boot
      // local sans config ; il NE DOIT JAMAIS être laissé en prod (sinon
      // tout magic link pourrait être forgé). Voir
      // docs/runbooks/intake-secrets-rotation.md.
      if (env.INTAKE_MAGIC_LINK_SECRET === 'dev-only-intake-magic-link-secret-32b') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INTAKE_MAGIC_LINK_SECRET'],
          message:
            'INTAKE_MAGIC_LINK_SECRET must not be the default dev value in production. ' +
            'Provision a real 32+ byte secret via AWS Secrets Manager (cv-intake-magic-link-secret).',
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
