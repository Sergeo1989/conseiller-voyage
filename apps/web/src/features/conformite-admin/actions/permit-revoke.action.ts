// T100 — Server Action déclaration retrait de permis (US3 FR-015).

'use server';

import { toUrlLocale } from '@/i18n';
import { apiClient } from '@/shared/lib/http';
import { DeclarePermitRevokedSchema } from '@cv/shared/conformite';
import { revalidatePath } from 'next/cache';

export type DeclarePermitActionResult =
  | {
      ok: true;
      data: {
        permitRevocationId: string;
        affectedConseillerCount: number;
        conseillerSuspensionCount: number;
      };
    }
  | { ok: false; error: string };

export async function declarePermitRevokedAction(
  rawBody: unknown,
  locale: string,
): Promise<DeclarePermitActionResult> {
  const urlLocale = toUrlLocale(locale);
  const parsed = DeclarePermitRevokedSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }
  const res = await apiClient.post<DeclarePermitActionResult extends { data: infer T } ? T : never>(
    '/api/conformite/admin/permits/revoke',
    parsed.data,
  );
  if (!res.ok) {
    const body = res.errorBody as { message?: string } | undefined;
    return { ok: false, error: body?.message ?? `Erreur API (${res.status}).` };
  }
  revalidatePath(`/${urlLocale}/admin/conformite`);
  return { ok: true, data: res.data };
}
