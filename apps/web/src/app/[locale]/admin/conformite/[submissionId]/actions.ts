// T079 — Server Actions admin pour approve/refuse.
// Appellent l'API NestJS via apiClient (T080), puis revalidatePath
// pour rafraîchir la file et le détail après décision.

'use server';

import { ApproveSubmissionSchema, RefuseSubmissionSchema } from '@cv/shared/conformite';
import { revalidatePath } from 'next/cache';
import { toUrlLocale } from '../../../../../i18n';
import { apiClient } from '../../../../_lib/api-client';

export type ApproveActionResult = { ok: true } | { ok: false; error: string };
export type RefuseActionResult = { ok: true } | { ok: false; error: string };

export async function approveSubmissionAction(
  submissionId: string,
  rawBody: unknown,
  locale: string,
): Promise<ApproveActionResult> {
  const urlLocale = toUrlLocale(locale);
  const parsed = ApproveSubmissionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }
  const res = await apiClient.post<{ ok: true }>(
    `/api/conformite/admin/submissions/${submissionId}/approve`,
    parsed.data,
  );
  if (!res.ok) {
    return { ok: false, error: extractApiError(res.errorBody) };
  }
  revalidatePath(`/${urlLocale}/admin/conformite`);
  revalidatePath(`/${urlLocale}/admin/conformite/${submissionId}`);
  return { ok: true };
}

export async function refuseSubmissionAction(
  submissionId: string,
  rawBody: unknown,
  locale: string,
): Promise<RefuseActionResult> {
  const urlLocale = toUrlLocale(locale);
  const parsed = RefuseSubmissionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation échouée.' };
  }
  const res = await apiClient.post<{ ok: true }>(
    `/api/conformite/admin/submissions/${submissionId}/refuse`,
    parsed.data,
  );
  if (!res.ok) {
    return { ok: false, error: extractApiError(res.errorBody) };
  }
  revalidatePath(`/${urlLocale}/admin/conformite`);
  revalidatePath(`/${urlLocale}/admin/conformite/${submissionId}`);
  return { ok: true };
}

function extractApiError(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const msg = (body as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Erreur API inconnue.';
}
