// Server Action — login conseiller / admin (US2).

'use server';

import { LoginDtoSchema } from '@cv/auth-domain';
import { AUTH_API_BASE_URL } from '../lib/api';
import { createSessionAndSetCookie } from '../lib/session-cookie';

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

  const res = await fetch(`${AUTH_API_BASE_URL}/api/auth/login`, {
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

  await createSessionAndSetCookie(payload.userId);

  return { kind: 'ok', redirect: payload.redirect, role: payload.role };
}
