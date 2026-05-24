// T125a — Server Action demande d'effacement Loi 25.

'use server';

import { ErasureRequestSchema } from '@cv/shared/conformite';
import { revalidatePath } from 'next/cache';
import { toUrlLocale } from '../../../../../i18n';
import { apiClient } from '../../../../_lib/api-client';

export type ErasureActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function requestErasureAction(
  rawBody: unknown,
  locale: string,
): Promise<ErasureActionResult> {
  const urlLocale = toUrlLocale(locale);
  const parsed = ErasureRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Confirmation incorrecte. Veuillez taper exactement le texte demandé.',
    };
  }
  const res = await apiClient.post<{ status: 'pending'; message: string }>(
    '/api/conformite/me/erasure-request',
    parsed.data,
  );
  if (!res.ok) {
    const body = res.errorBody as { message?: string } | undefined;
    return { ok: false, error: body?.message ?? `Erreur API (${res.status}).` };
  }
  revalidatePath(`/${urlLocale}/conseiller/conformite`);
  return { ok: true, message: res.data.message };
}
