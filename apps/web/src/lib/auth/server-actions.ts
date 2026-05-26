// Server Actions Next.js pour les flows d'authentification (feature 002).
//
// US1 — signupAction : POST /api/auth/signup côté API NestJS.
// US3 — resendVerificationEmailAction : POST /api/auth/verify-email/resend.
// Autres actions ajoutées au fur et à mesure des US.
//
// Cf. apps/web/src/lib/mfa/server-actions.ts pour le pattern apiFetch.

'use server';

import { SignupDtoSchema } from '@cv/auth-domain';

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
