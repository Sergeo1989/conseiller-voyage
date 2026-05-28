// T105 — Server Action révocation conseiller (US4 FR-010).

'use server';

import { toUrlLocale } from '@/i18n';
import { apiClient } from '@/shared/lib/http';
import { RevokeConseillerSchema } from '@cv/shared/conformite';
import { revalidatePath } from 'next/cache';

export type RevokeActionResult = { ok: true } | { ok: false; error: string };

export async function revokeConseillerAction(
  complianceId: string,
  rawBody: unknown,
  locale: string,
): Promise<RevokeActionResult> {
  const urlLocale = toUrlLocale(locale);
  const parsed = RevokeConseillerSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }
  const res = await apiClient.post<{ ok: true }>(
    `/api/conformite/admin/conseillers/${complianceId}/revoke`,
    parsed.data,
  );
  if (!res.ok) {
    const body = res.errorBody as { message?: string } | undefined;
    return { ok: false, error: body?.message ?? `Erreur API (${res.status}).` };
  }
  revalidatePath(`/${urlLocale}/admin/conformite`);
  revalidatePath(`/${urlLocale}/admin/conformite/conseillers/${complianceId}`);
  return { ok: true };
}
