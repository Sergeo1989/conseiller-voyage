// T115e (C1) — Server Action eraseAllVoyageurDataAction (FR-022a).
//
// Effacement global contact + tous briefs. Le NestJS révoque le cookie
// __Host-cv.intake.token côté serveur ; côté Web on supprime aussi le
// cookie pour défense en profondeur.

'use server';

import { getEnv } from '@/env';
import { cookies } from 'next/headers';
import { ERASURE_ALL_PHRASE, ErasureRequestAllSchema } from '../schemas';

const PROD_COOKIE_NAME = '__Host-cv.intake.token';
const DEV_COOKIE_NAME = 'cv.intake.session';

export type EraseAllVoyageurDataActionResult =
  | { readonly ok: true; readonly briefsAffectedCount: number }
  | {
      readonly ok: false;
      readonly code:
        | 'INVALID_CONFIRMATION'
        | 'STALE_BRIEF_COUNT'
        | 'UNAUTHORIZED'
        | 'NOT_FOUND'
        | 'ALREADY_DELETED'
        | 'NETWORK_ERROR';
      readonly message: string;
      readonly actualCount?: number;
    };

export async function eraseAllVoyageurDataAction(
  confirmation: string,
  acknowledgedBriefCount: number,
): Promise<EraseAllVoyageurDataActionResult> {
  const parsed = ErasureRequestAllSchema.safeParse({
    confirmation,
    acknowledgedBriefCount,
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID_CONFIRMATION',
      message: `Tapez exactement ${ERASURE_ALL_PHRASE}.`,
    };
  }
  const store = await cookies();
  const cookie = store.get(PROD_COOKIE_NAME) ?? store.get(DEV_COOKIE_NAME);
  if (!cookie) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Session expirée.' };
  }
  const url = `${getEnv().API_INTERNAL_URL}/api/intake/voyageur/erase-all-data`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-By': 'web',
      Cookie: `${cookie.name}=${cookie.value}`,
    },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });
  if (response.ok) {
    const body = (await response.json()) as { briefsAffectedCount: number };
    // Révocation côté Web (defense in depth — le NestJS a déjà clear-cookie)
    store.delete(PROD_COOKIE_NAME);
    store.delete(DEV_COOKIE_NAME);
    return { ok: true, briefsAffectedCount: body.briefsAffectedCount };
  }
  return mapStatusToFailure(response);
}

async function mapStatusToFailure(
  response: Response,
): Promise<Extract<EraseAllVoyageurDataActionResult, { ok: false }>> {
  if (response.status === 400) {
    try {
      const body = (await response.json()) as { actualCount?: number };
      if (body.actualCount !== undefined) {
        return {
          ok: false,
          code: 'STALE_BRIEF_COUNT',
          message: 'Le nombre de briefs a changé. Rechargez la page.',
          actualCount: body.actualCount,
        };
      }
    } catch {
      /* fall-through */
    }
    return { ok: false, code: 'INVALID_CONFIRMATION', message: 'Phrase incorrecte.' };
  }
  if (response.status === 401) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Session expirée.' };
  }
  if (response.status === 404) {
    return { ok: false, code: 'NOT_FOUND', message: 'Contact introuvable.' };
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
