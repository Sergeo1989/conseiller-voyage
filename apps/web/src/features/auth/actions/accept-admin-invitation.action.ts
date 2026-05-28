// Server Action — acceptation d'une invitation admin par le destinataire (US7).
// Orchestre : consume → login auto → création session.

'use server';

import { AUTH_API_BASE_URL } from '../lib/api';
import { createSessionAndSetCookie } from '../lib/session-cookie';

export type AcceptInvitationResult =
  | { readonly kind: 'ok'; readonly redirect: string }
  | { readonly kind: 'invalid_or_expired' }
  | { readonly kind: 'target_already_registered' }
  | { readonly kind: 'validation_error'; readonly errors: readonly string[] }
  | { readonly kind: 'error' };

export async function acceptAdminInvitationAction(
  token: string,
  firstName: string,
  lastName: string,
  password: string,
): Promise<AcceptInvitationResult> {
  // 1. Consume côté API (crée user + account)
  const consumeRes = await fetch(`${AUTH_API_BASE_URL}/api/auth/admin-invitation/consume`, {
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
  const loginRes = await fetch(`${AUTH_API_BASE_URL}/api/auth/login`, {
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
  await createSessionAndSetCookie(loginPayload.userId);

  return { kind: 'ok', redirect: loginPayload.redirect };
}
