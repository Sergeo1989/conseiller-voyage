// T076 — Server Actions de la page de soumission.
// Wrappent les endpoints /upload-urls et /submissions de l'API NestJS
// via apiClient (T080).

'use server';

import {
  type RequestUploadUrlsResponse,
  RequestUploadUrlsSchema,
  type SubmitDossierResponse,
  SubmitDossierSchema,
} from '@cv/shared/conformite';
import { apiClient } from '../../../../_lib/api-client';

export type UploadUrlsActionResult =
  | { ok: true; data: RequestUploadUrlsResponse }
  | { ok: false; error: string };

export type SubmitDossierActionResult =
  | { ok: true; data: SubmitDossierResponse }
  | { ok: false; error: string; fieldErrors?: Array<{ path: string; message: string }> };

export async function requestUploadUrlsAction(rawBody: unknown): Promise<UploadUrlsActionResult> {
  const parsed = RequestUploadUrlsSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }
  const result = await apiClient.post<RequestUploadUrlsResponse>(
    '/api/conformite/me/upload-urls',
    parsed.data,
  );
  if (!result.ok) {
    return { ok: false, error: extractApiError(result.errorBody) };
  }
  return { ok: true, data: result.data };
}

export async function submitDossierAction(rawBody: unknown): Promise<SubmitDossierActionResult> {
  const parsed = SubmitDossierSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Validation échouée.',
      fieldErrors: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }
  const result = await apiClient.post<SubmitDossierResponse>(
    '/api/conformite/me/submissions',
    parsed.data,
  );
  if (!result.ok) {
    return { ok: false, error: extractApiError(result.errorBody) };
  }
  return { ok: true, data: result.data };
}

function extractApiError(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const msg = (body as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Erreur API inconnue.';
}
