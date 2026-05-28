// Server Action — changement mot de passe utilisateur connecté (US6).

'use server';

import { cookies } from 'next/headers';
import { AUTH_API_BASE_URL } from '../lib/api';

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
  const res = await fetch(`${AUTH_API_BASE_URL}/api/auth/password-change`, {
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
