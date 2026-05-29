// T108 — Server Action requestBriefErasureAction (FR-022).
//
// Wrapper Server Action vers POST /api/intake/briefs/:briefId/erasure-request.
// Le cookie voyageur (__Host-cv.intake.token / cv.intake.session) est
// forward par le helper `apiClient` mais il ne le fait QUE pour les
// cookies session admin — on relaie explicitement.

'use server';

import { getEnv } from '@/env';
import { cookies } from 'next/headers';
import { ERASURE_BRIEF_PHRASE, ErasureRequestBriefSchema } from '../schemas';

const PROD_COOKIE_NAME = '__Host-cv.intake.token';
const DEV_COOKIE_NAME = 'cv.intake.session';

export type RequestBriefErasureActionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code:
        | 'INVALID_CONFIRMATION'
        | 'UNAUTHORIZED'
        | 'NOT_FOUND'
        | 'ALREADY_DELETED'
        | 'NETWORK_ERROR';
      readonly message: string;
    };

export async function requestBriefErasureAction(
  briefId: string,
  confirmation: string,
): Promise<RequestBriefErasureActionResult> {
  const parsed = ErasureRequestBriefSchema.safeParse({ confirmation });
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID_CONFIRMATION',
      message: `Tapez exactement ${ERASURE_BRIEF_PHRASE}.`,
    };
  }
  const store = await cookies();
  const cookie = store.get(PROD_COOKIE_NAME) ?? store.get(DEV_COOKIE_NAME);
  if (!cookie) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Session expirée.' };
  }
  const url = `${getEnv().API_INTERNAL_URL}/api/intake/briefs/${encodeURIComponent(briefId)}/erasure-request`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-By': 'web',
      Cookie: `${cookie.name}=${cookie.value}`,
    },
    body: JSON.stringify({ confirmation: parsed.data.confirmation }),
    cache: 'no-store',
  });
  if (response.ok) return { ok: true };
  if (response.status === 400) {
    return { ok: false, code: 'INVALID_CONFIRMATION', message: 'Confirmation incorrecte.' };
  }
  if (response.status === 401) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Session expirée.' };
  }
  if (response.status === 404) {
    return { ok: false, code: 'NOT_FOUND', message: 'Brief introuvable.' };
  }
  if (response.status === 409) {
    return { ok: false, code: 'ALREADY_DELETED', message: 'Déjà supprimé.' };
  }
  return {
    ok: false,
    code: 'NETWORK_ERROR',
    message: 'Le serveur ne répond pas. Réessayez dans un instant.',
  };
}
