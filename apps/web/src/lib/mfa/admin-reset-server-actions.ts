// Server Action pour le reset MFA admin (US4).
//
// Génère un Idempotency-Key UUID v4 côté serveur. Côté API NestJS,
// l'IdempotencyInterceptor Redis (livré par 001) cache la réponse 24h.

'use server';

import { randomUUID } from 'node:crypto';
import { JustificationSchema, UuidV4Schema } from '@cv/mfa';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '../../auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const ResetInputSchema = z.object({
  targetUserId: UuidV4Schema,
  justification: JustificationSchema,
});

export type ResetUserMfaAdminResult =
  | { kind: 'ok'; sessionsRevokedCount: number; warningDisplayedLastAdmin: boolean }
  | { kind: 'self_reset_forbidden' }
  | { kind: 'target_not_found' }
  | { kind: 'target_not_enrolled' }
  | { kind: 'stepup_required' }
  | { kind: 'error'; message: string };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher 6 cas
export async function resetUserMfaAdminAction(
  formData: FormData,
): Promise<ResetUserMfaAdminResult> {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'admin') {
    return { kind: 'error', message: 'Forbidden — admin only' };
  }

  const parsed = ResetInputSchema.safeParse({
    targetUserId: formData.get('targetUserId'),
    justification: formData.get('justification'),
  });
  if (!parsed.success) {
    return { kind: 'error', message: 'Validation failed' };
  }

  const idempotencyKey = randomUUID();
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const res = await fetch(`${API_BASE_URL}/api/mfa/admin/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ ...parsed.data, idempotencyKey }),
    cache: 'no-store',
  });
  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;

  if (res.status === 200 && typeof data === 'object' && data !== null) {
    return {
      kind: 'ok',
      sessionsRevokedCount: Number(
        (data as { sessionsRevokedCount?: unknown }).sessionsRevokedCount ?? 0,
      ),
      warningDisplayedLastAdmin: Boolean(
        (data as { warningDisplayedLastAdmin?: unknown }).warningDisplayedLastAdmin,
      ),
    };
  }
  if (res.status === 403 && typeof data === 'object' && data !== null) {
    const code = String((data as { code?: unknown }).code ?? '');
    if (code === 'STEP_UP_REQUIRED') return { kind: 'stepup_required' };
  }
  if (res.status === 400 && typeof data === 'object' && data !== null) {
    const code = String((data as { code?: unknown }).code ?? '');
    if (code === 'SELF_RESET_FORBIDDEN') return { kind: 'self_reset_forbidden' };
  }
  if (res.status === 404) return { kind: 'target_not_found' };
  if (res.status === 409 && typeof data === 'object' && data !== null) {
    const code = String((data as { code?: unknown }).code ?? '');
    if (code === 'TARGET_NOT_ENROLLED') return { kind: 'target_not_enrolled' };
  }
  return { kind: 'error', message: `Unexpected status ${res.status}` };
}
