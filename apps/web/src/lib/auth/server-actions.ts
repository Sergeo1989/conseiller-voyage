// Server Actions Next.js pour les flows d'authentification (feature 002).
//
// US1 — signupAction : POST /api/auth/signup côté API NestJS.
// US3 — resendVerificationEmailAction : POST /api/auth/verify-email/resend.
// Autres actions ajoutées au fur et à mesure des US.
//
// Cf. apps/web/src/lib/mfa/server-actions.ts pour le pattern apiFetch.

'use server';

import { randomBytes } from 'node:crypto';
import { LoginDtoSchema, SignupDtoSchema } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { cookies } from 'next/headers';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface FetchInput {
  readonly path: string;
  readonly body: object;
  readonly forwardCookie?: boolean;
}

interface FetchResult {
  readonly status: number;
  readonly data: unknown;
}

async function apiFetch(input: FetchInput): Promise<FetchResult> {
  // Pour signup public, pas besoin de forwarder le cookie session.
  const res = await fetch(`${API_BASE_URL}${input.path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input.body),
    cache: 'no-store',
  });
  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;
  return { status: res.status, data };
}

// ---------------------------------------------------------------------
// signupAction (US1)
// ---------------------------------------------------------------------

export type SignupResult =
  | { readonly kind: 'ok' }
  | {
      readonly kind: 'validation_error';
      readonly errors: ReadonlyArray<{ field: string; code: string }>;
    }
  | { readonly kind: 'rate_limited' }
  | { readonly kind: 'error'; readonly message: string };

export async function signupAction(formData: FormData): Promise<SignupResult> {
  const parsed = SignupDtoSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    acceptedTerms: formData.get('acceptedTerms') === 'true',
    acceptedPrivacyPolicy: formData.get('acceptedPrivacyPolicy') === 'true',
  });

  if (!parsed.success) {
    return {
      kind: 'validation_error',
      errors: parsed.error.issues.map((i) => ({
        field: i.path.join('.'),
        code: i.message,
      })),
    };
  }

  const { status, data } = await apiFetch({
    path: '/api/auth/signup',
    body: parsed.data,
  });

  if (status === 202) return { kind: 'ok' };
  if (status === 429) return { kind: 'rate_limited' };
  if (status === 400 && data && typeof data === 'object' && 'errors' in data) {
    const errs = (data as { errors?: unknown }).errors;
    if (Array.isArray(errs)) {
      return {
        kind: 'validation_error',
        errors: errs.map((e: unknown) => ({
          field: 'password',
          code: typeof e === 'string' ? e : String(e),
        })),
      };
    }
  }
  return { kind: 'error', message: 'Une erreur inattendue est survenue.' };
}

// ---------------------------------------------------------------------
// loginAction (US2)
// ---------------------------------------------------------------------
//
// POST /api/auth/login → si OK, crée une session côté DB et pose le
// cookie de session. Pattern aligné sur devLoginAction (héritage 002a) ;
// la migration vers Auth.js v5 Credentials provider sera faite en suivi
// (les helpers `auth()` existants restent compatibles via le même
// schéma de cookie).

const SESSION_TTL_DAYS = 30;
const SESSION_COOKIE_NAME_DEV = 'authjs.session-token';
const SESSION_COOKIE_NAME_PROD = '__Host-cv.session.token';

export type LoginResult =
  | {
      readonly kind: 'ok';
      readonly redirect: string;
      readonly role: 'voyageur' | 'conseiller' | 'admin';
    }
  | { readonly kind: 'invalid_credentials' }
  | { readonly kind: 'locked'; readonly retryAfterSec: number }
  | { readonly kind: 'validation_error' }
  | { readonly kind: 'error' };

export async function loginAction(formData: FormData): Promise<LoginResult> {
  const parsed = LoginDtoSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { kind: 'validation_error' };

  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });

  if (res.status === 423) {
    const retryAfter = Number.parseInt(res.headers.get('Retry-After') ?? '900', 10);
    return { kind: 'locked', retryAfterSec: retryAfter };
  }
  if (res.status === 401) return { kind: 'invalid_credentials' };
  if (res.status !== 200) return { kind: 'error' };

  const payload = (await res.json()) as {
    readonly userId: string;
    readonly role: 'voyageur' | 'conseiller' | 'admin';
    readonly redirect: string;
  };

  // Crée la session côté DB (Auth.js v5 schema) + pose le cookie.
  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: { sessionToken, userId: payload.userId, expires },
  });

  const isProd = process.env.NODE_ENV === 'production';
  const cookieStore = await cookies();
  cookieStore.set(isProd ? SESSION_COOKIE_NAME_PROD : SESSION_COOKIE_NAME_DEV, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    expires,
  });

  return { kind: 'ok', redirect: payload.redirect, role: payload.role };
}

// ---------------------------------------------------------------------
// resendVerificationEmailAction (US3)
// ---------------------------------------------------------------------

export type ResendResult = { readonly kind: 'ok' } | { readonly kind: 'error' };

export async function resendVerificationEmailAction(email: string): Promise<ResendResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/verify-email/resend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    cache: 'no-store',
  });
  if (res.status === 202) return { kind: 'ok' };
  return { kind: 'error' };
}
