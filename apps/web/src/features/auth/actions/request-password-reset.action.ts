// Server Action — demande de reset mot de passe (US5).

'use server';

import { AUTH_API_BASE_URL } from '../lib/api';

export type RequestResetResult = { readonly kind: 'ok' } | { readonly kind: 'error' };

export async function requestPasswordResetAction(email: string): Promise<RequestResetResult> {
  const res = await fetch(`${AUTH_API_BASE_URL}/api/auth/password-reset-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    cache: 'no-store',
  });
  if (res.status === 202) return { kind: 'ok' };
  return { kind: 'error' };
}
