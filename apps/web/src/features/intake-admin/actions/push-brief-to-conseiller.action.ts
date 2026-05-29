// T121 — Server Action admin pushBriefToConseillerAction (FR-027).
// Wrapper de POST /api/intake/admin/briefs/:briefId/push-manual avec
// session admin (cookie __Host-cv.session.token forward).

'use server';

import { apiClient } from '@/shared/lib/http';
import { AdminPushManualSchema } from '@cv/shared/intake';

export type PushBriefToConseillerActionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code:
        | 'INVALID_REASON'
        | 'CONSEILLER_NOT_VERIFIED'
        | 'BRIEF_NOT_FOUND'
        | 'BRIEF_ANONYMIZED'
        | 'VALIDATION_FAILED'
        | 'NETWORK_ERROR';
      readonly message: string;
    };

export async function pushBriefToConseillerAction(
  briefId: string,
  conseillerComplianceId: string,
  reason: string,
): Promise<PushBriefToConseillerActionResult> {
  const parsed = AdminPushManualSchema.safeParse({ conseillerComplianceId, reason });
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: parsed.error.issues[0]?.message ?? 'Validation échouée.',
    };
  }
  const result = await apiClient.post<{ status: 'ok' }>(
    `/api/intake/admin/briefs/${encodeURIComponent(briefId)}/push-manual`,
    parsed.data,
  );
  if (result.ok) return { ok: true };
  if (result.status === 400) {
    const body = result.errorBody as { message?: string } | undefined;
    if (body?.message?.includes('non-vérifié')) {
      return {
        ok: false,
        code: 'CONSEILLER_NOT_VERIFIED',
        message: body.message,
      };
    }
    return {
      ok: false,
      code: 'INVALID_REASON',
      message: body?.message ?? 'Motif invalide.',
    };
  }
  if (result.status === 404) {
    return { ok: false, code: 'BRIEF_NOT_FOUND', message: 'Brief introuvable.' };
  }
  if (result.status === 410) {
    return { ok: false, code: 'BRIEF_ANONYMIZED', message: 'Brief anonymisé.' };
  }
  return {
    ok: false,
    code: 'NETWORK_ERROR',
    message: 'Le serveur ne répond pas.',
  };
}
