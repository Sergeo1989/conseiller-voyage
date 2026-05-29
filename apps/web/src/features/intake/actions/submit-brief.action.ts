// T062 — Server Action submitBriefAction.
// Wrapper Server Action autour de POST /api/intake/briefs.
//
// Convention VIII.a §3 :
//   - validation Zod (1ère couche, redondante avec API mais défense en
//     profondeur Principe IX)
//   - forward au NestJS via intakeApiClient
//   - retour ActionResult discriminé consommable par le Client Component

'use server';

import { type SubmitBriefApiResponse, intakeApiClient } from '../infrastructure/api-client';
import { type SubmitBriefPayload, SubmitBriefSchema } from '../schemas';

export type SubmitBriefActionResult =
  | { readonly ok: true; readonly data: SubmitBriefApiResponse }
  | {
      readonly ok: false;
      readonly code:
        | 'VALIDATION_FAILED'
        | 'EMAIL_RATE_LIMIT_EXCEEDED'
        | 'RATE_LIMIT_EXCEEDED'
        | 'DISPOSABLE_EMAIL_DETECTED'
        | 'NETWORK_ERROR';
      readonly message: string;
      readonly fieldErrors?: ReadonlyArray<{ path: string; message: string }>;
      readonly retryAfterSeconds?: number;
    };

export async function submitBriefAction(rawBody: unknown): Promise<SubmitBriefActionResult> {
  const parsed = SubmitBriefSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: 'Le formulaire contient des erreurs.',
      fieldErrors: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }

  const result = await intakeApiClient.submitBrief(parsed.data as SubmitBriefPayload);
  if (result.ok) {
    return { ok: true, data: result.data };
  }

  return mapApiFailureToResult(result.status, result.errorBody);
}

type Failure = Extract<SubmitBriefActionResult, { ok: false }>;

function mapApiFailureToResult(status: number, body: unknown): Failure {
  const errorBody = (body ?? {}) as Record<string, unknown>;
  const code = errorBody.code as string | undefined;

  if (status === 400 || code === undefined) {
    return mapValidationFailure(errorBody);
  }
  if (code === 'EMAIL_RATE_LIMIT_EXCEEDED') {
    return mapEmailRateLimitFailure(errorBody);
  }
  if (code === 'RATE_LIMIT_EXCEEDED') {
    return {
      ok: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message:
        (errorBody.message as string) ??
        'Votre demande ne peut être traitée actuellement, veuillez réessayer plus tard.',
    };
  }
  if (code === 'DISPOSABLE_EMAIL_DETECTED') {
    return {
      ok: false,
      code: 'DISPOSABLE_EMAIL_DETECTED',
      message:
        (errorBody.message as string) ??
        'Cette adresse semble temporaire. Utilisez un courriel durable.',
    };
  }
  return {
    ok: false,
    code: 'NETWORK_ERROR',
    message: 'Le serveur ne répond pas. Réessayez dans un instant.',
  };
}

function mapValidationFailure(errorBody: Record<string, unknown>): Failure {
  const message = (errorBody.message as string) ?? 'Le formulaire contient des erreurs.';
  const fieldErrors = errorBody.errors as
    | ReadonlyArray<{ path: string; message: string }>
    | undefined;
  return fieldErrors
    ? { ok: false, code: 'VALIDATION_FAILED', message, fieldErrors }
    : { ok: false, code: 'VALIDATION_FAILED', message };
}

function mapEmailRateLimitFailure(errorBody: Record<string, unknown>): Failure {
  const retryAfter = errorBody.retryAfter as number | undefined;
  const message =
    (errorBody.message as string) ?? 'Vous avez soumis 3 briefs sur cette adresse en 24 h.';
  return retryAfter !== undefined
    ? { ok: false, code: 'EMAIL_RATE_LIMIT_EXCEEDED', message, retryAfterSeconds: retryAfter }
    : { ok: false, code: 'EMAIL_RATE_LIMIT_EXCEEDED', message };
}
