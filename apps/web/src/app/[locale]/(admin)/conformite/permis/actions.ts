// T100 — Server Action déclaration retrait de permis (US3 FR-015).

'use server';

import { DeclarePermitRevokedSchema } from '@cv/shared/conformite';
import { revalidatePath } from 'next/cache';
import { apiClient } from '../../../../_lib/api-client';

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
  revalidatePath(`/${locale}/admin/conformite`);
  return { ok: true, data: res.data };
}
