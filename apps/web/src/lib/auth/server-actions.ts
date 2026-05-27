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

// ---------------------------------------------------------------------
// requestPasswordResetAction (US5)
// ---------------------------------------------------------------------

export type RequestResetResult = { readonly kind: 'ok' } | { readonly kind: 'error' };

export async function requestPasswordResetAction(email: string): Promise<RequestResetResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/password-reset-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    cache: 'no-store',
  });
  if (res.status === 202) return { kind: 'ok' };
  return { kind: 'error' };
}

// ---------------------------------------------------------------------
// completePasswordResetAction (US5)
// ---------------------------------------------------------------------

export type CompleteResetResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'invalid_or_expired' }
  | { readonly kind: 'validation_error'; readonly errors: readonly string[] }
  | { readonly kind: 'error' };

export async function completePasswordResetAction(
  token: string,
  newPassword: string,
): Promise<CompleteResetResult> {
  const res = await fetch(`${API_BASE_URL}/api/auth/password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
    cache: 'no-store',
  });
  if (res.status === 200) return { kind: 'ok' };
  if (res.status === 400) {
    const data = (await res.json().catch(() => null)) as {
      code?: string;
      errors?: unknown;
    } | null;
    if (data?.code === 'INVALID_OR_EXPIRED_TOKEN') return { kind: 'invalid_or_expired' };
    if (data?.code === 'VALIDATION_FAILED' && Array.isArray(data.errors)) {
      return {
        kind: 'validation_error',
        errors: data.errors.map((e) => (typeof e === 'string' ? e : String(e))),
      };
    }
  }
  return { kind: 'error' };
}

// ---------------------------------------------------------------------
// changePasswordAction (US6)
// ---------------------------------------------------------------------

export type ChangePasswordResult =
  | { readonly kind: 'ok'; readonly sessionsRevokedCount: number }
  | { readonly kind: 'invalid_current' }
  | { readonly kind: 'password_reuse' }
  | { readonly kind: 'validation_error'; readonly errors: readonly string[] }
  | { readonly kind: 'step_up_required' }
  | { readonly kind: 'error' };

export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
  newPasswordConfirmation: string,
): Promise<ChangePasswordResult> {
  const cookieStore = await cookies();
  const cookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const res = await fetch(`${API_BASE_URL}/api/auth/password-change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ currentPassword, newPassword, newPasswordConfirmation }),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => null)) as {
    sessionsRevokedCount?: number;
    code?: string;
    errors?: unknown;
  } | null;
  if (res.status === 200 && typeof data?.sessionsRevokedCount === 'number') {
    return { kind: 'ok', sessionsRevokedCount: data.sessionsRevokedCount };
  }
  if (data?.code === 'STEP_UP_REQUIRED') return { kind: 'step_up_required' };
  if (data?.code === 'INVALID_CURRENT_PASSWORD') return { kind: 'invalid_current' };
  if (data?.code === 'PASSWORD_REUSE') return { kind: 'password_reuse' };
  if (data?.code === 'VALIDATION_FAILED' && Array.isArray(data.errors)) {
    return {
      kind: 'validation_error',
      errors: data.errors.map((e) => (typeof e === 'string' ? e : String(e))),
    };
  }
  return { kind: 'error' };
}

// ---------------------------------------------------------------------
// inviteAdminAction + acceptAdminInvitationAction (US7)
// ---------------------------------------------------------------------

export type InviteAdminResult =
  | { readonly kind: 'ok'; readonly invitationId: string; readonly expiresAt: string }
  | { readonly kind: 'self_invitation_forbidden' }
  | { readonly kind: 'target_already_registered' }
  | { readonly kind: 'invitation_already_active'; readonly expiresAt: string }
  | { readonly kind: 'error' };

export async function inviteAdminAction(targetEmail: string): Promise<InviteAdminResult> {
  const cookieStore = await cookies();
  const cookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const res = await fetch(`${API_BASE_URL}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      'Idempotency-Key': randomBytes(16).toString('hex'),
    },
    body: JSON.stringify({ targetEmail }),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => null)) as {
    invitationId?: string;
    expiresAt?: string;
    code?: string;
  } | null;
  if (res.status === 202 && data?.invitationId && data.expiresAt) {
    return { kind: 'ok', invitationId: data.invitationId, expiresAt: data.expiresAt };
  }
  if (data?.code === 'SELF_INVITATION_FORBIDDEN') return { kind: 'self_invitation_forbidden' };
  if (data?.code === 'TARGET_EMAIL_ALREADY_REGISTERED')
    return { kind: 'target_already_registered' };
  if (data?.code === 'INVITATION_ALREADY_ACTIVE' && data.expiresAt) {
    return { kind: 'invitation_already_active', expiresAt: data.expiresAt };
  }
  return { kind: 'error' };
}

export type AcceptInvitationResult =
  | { readonly kind: 'ok'; readonly redirect: string }
  | { readonly kind: 'invalid_or_expired' }
  | { readonly kind: 'target_already_registered' }
  | { readonly kind: 'validation_error'; readonly errors: readonly string[] }
  | { readonly kind: 'error' };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: orchestrator C1 — 3 étapes (consume → login → session) avec branchements d'erreur typés.
export async function acceptAdminInvitationAction(
  token: string,
  firstName: string,
  lastName: string,
  password: string,
): Promise<AcceptInvitationResult> {
  // 1. Consume côté API (crée user + account)
  const consumeRes = await fetch(`${API_BASE_URL}/api/auth/admin-invitation/consume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      firstName,
      lastName,
      password,
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
    }),
    cache: 'no-store',
  });
  const consumeData = (await consumeRes.json().catch(() => null)) as {
    email?: string;
    code?: string;
    errors?: unknown;
  } | null;
  if (consumeRes.status !== 200 || !consumeData?.email) {
    if (consumeData?.code === 'INVALID_OR_EXPIRED_TOKEN') return { kind: 'invalid_or_expired' };
    if (consumeData?.code === 'TARGET_EMAIL_ALREADY_REGISTERED') {
      return { kind: 'target_already_registered' };
    }
    if (consumeData?.code === 'VALIDATION_FAILED' && Array.isArray(consumeData.errors)) {
      return {
        kind: 'validation_error',
        errors: consumeData.errors.map((e) => (typeof e === 'string' ? e : String(e))),
      };
    }
    return { kind: 'error' };
  }

  // 2. Login automatique
  const loginRes = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: consumeData.email, password }),
    cache: 'no-store',
  });
  if (loginRes.status !== 200) return { kind: 'error' };
  const loginPayload = (await loginRes.json()) as {
    userId: string;
    role: 'voyageur' | 'conseiller' | 'admin';
    redirect: string;
  };

  // 3. Crée session + cookie
  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: { sessionToken, userId: loginPayload.userId, expires },
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

  return { kind: 'ok', redirect: loginPayload.redirect };
}

// ---------------------------------------------------------------------
// logoutAction (US4)
// ---------------------------------------------------------------------
//
// DELETE auth_sessions WHERE sessionToken = currentSessionToken + clear
// cookie. Pattern aligné sur devLogoutAction (héritage 002a). L'endpoint
// NestJS /api/auth/logout reste disponible pour tests et future
// force-logout admin (H9 review).

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const tokenProd = cookieStore.get(SESSION_COOKIE_NAME_PROD)?.value;
  const tokenDev = cookieStore.get(SESSION_COOKIE_NAME_DEV)?.value;
  const token = tokenProd ?? tokenDev;
  if (token) {
    await prisma.authSession.deleteMany({ where: { sessionToken: token } });
    if (tokenProd) cookieStore.delete(SESSION_COOKIE_NAME_PROD);
    if (tokenDev) cookieStore.delete(SESSION_COOKIE_NAME_DEV);
  }
}
