// Server Action — finalisation du reset mot de passe via token email (US5).

'use server';

import { AUTH_API_BASE_URL } from '../lib/api';

export type CompleteResetResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'invalid_or_expired' }
  | { readonly kind: 'validation_error'; readonly errors: readonly string[] }
  | { readonly kind: 'error' };

export async function completePasswordResetAction(
  token: string,
  newPassword: string,
): Promise<CompleteResetResult> {
  const res = await fetch(`${AUTH_API_BASE_URL}/api/auth/password-reset`, {
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
