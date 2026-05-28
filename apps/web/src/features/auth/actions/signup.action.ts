// Server Action — inscription publique (US1).

'use server';

import { SignupDtoSchema } from '@cv/auth-domain';
import { AUTH_API_BASE_URL } from '../lib/api';

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

  const res = await fetch(`${AUTH_API_BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });
  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;

  if (res.status === 202) return { kind: 'ok' };
  if (res.status === 429) return { kind: 'rate_limited' };
  if (res.status === 400 && data && typeof data === 'object' && 'errors' in data) {
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
