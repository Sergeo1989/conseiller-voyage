// T016 — Validation Zod des variables d'environnement Next.js.
// Variables `NEXT_PUBLIC_*` sont exposées au client. Toute autre variable
// reste server-only.
//
// S'enrichit au fur et à mesure :
//   T017 ajoute AUTH_SECRET, NEXTAUTH_URL
//   T016 (apps/api) déclare les variables backend correspondantes.
//
// T007 (feature 002-voyageur-intake) : NOOP — toutes les vars intake
// vivent côté API NestJS (rate-limit Redis, secret HMAC, durée expiration).
// Le countdown 120s côté EmailSentNotice (FR-013a) est une constante UX,
// pas une env var. Si un futur besoin se présente (ex: feature flag
// d'override pour QA), l'ajouter ici en NEXT_PUBLIC_INTAKE_*.

import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // URL interne pour les Server Actions appelant NestJS (réseau Docker en dev).
  API_INTERNAL_URL: z.string().url().default('http://localhost:3001'),

  // Auth.js (T017) — clé secrète et URL canonique.
  AUTH_SECRET: z.string().min(32).optional(),
  NEXTAUTH_URL: z.string().url().optional(),

  // DB (Auth.js Prisma adapter — T017).
  DATABASE_URL: z.string().url().optional(),

  // Variables publiques (exposées au client).
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}
