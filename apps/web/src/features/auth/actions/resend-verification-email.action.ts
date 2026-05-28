// Server Action — relance d'email de vérification (US3).

'use server';

import { AUTH_API_BASE_URL } from '../lib/api';

export type ResendResult = { readonly kind: 'ok' } | { readonly kind: 'error' };

export async function resendVerificationEmailAction(email: string): Promise<ResendResult> {
  const res = await fetch(`${AUTH_API_BASE_URL}/api/auth/verify-email/resend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    cache: 'no-store',
  });
  if (res.status === 202) return { kind: 'ok' };
  return { kind: 'error' };
}
