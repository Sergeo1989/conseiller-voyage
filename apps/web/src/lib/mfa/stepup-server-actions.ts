// Server Actions du flow step-up (US2).
//
// Cf. specs/005-mfa-conseiller/contracts/server-actions.md § stepUpAction.

'use server';

import { IntendedActionSchema, TotpCodeSchema } from '@cv/mfa';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { auth } from '../../auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiFetch(
  path: string,
  init: { method: 'POST' | 'GET'; body?: object },
): Promise<{ status: number; data: unknown }> {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: init.method,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Cookie: cookieHeader,
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });
  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;
  return { status: res.status, data };
}

// ---------------------------------------------------------------------
// stepUpAction
// ---------------------------------------------------------------------

const StepUpInputSchema = z.object({
  totpCode: TotpCodeSchema,
  intendedAction: IntendedActionSchema,
});

export type StepUpActionResult =
  | { kind: 'ok' }
  | { kind: 'invalid'; attemptsRemaining: number }
  | { kind: 'session_killed' }
  | { kind: 'error'; message: string };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher de réponse API typé sur 5 cas distincts — extraire serait artificiel
export async function stepUpAction(formData: FormData): Promise<StepUpActionResult> {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const parsed = StepUpInputSchema.safeParse({
    totpCode: formData.get('totpCode'),
    intendedAction: formData.get('intendedAction'),
  });
  if (!parsed.success) {
    return { kind: 'invalid', attemptsRemaining: 3 };
  }

  const { status, data } = await apiFetch('/api/mfa/step-up', {
    method: 'POST',
    body: parsed.data,
  });

  if (status === 200) {
    if (typeof data === 'object' && data !== null && 'kind' in data) {
      const kind = (data as { kind: unknown }).kind;
      if (kind === 'ok') return { kind: 'ok' };
      if (kind === 'invalid') {
        const remaining =
          'attemptsRemaining' in data &&
          typeof (data as { attemptsRemaining: unknown }).attemptsRemaining === 'number'
            ? (data as { attemptsRemaining: number }).attemptsRemaining
            : 0;
        return { kind: 'invalid', attemptsRemaining: remaining };
      }
    }
  }
  if (status === 401) {
    const code =
      typeof data === 'object' && data !== null && 'code' in data
        ? String((data as { code: unknown }).code)
        : '';
    if (code === 'SESSION_KILLED') return { kind: 'session_killed' };
  }
  return { kind: 'error', message: `Unexpected status ${status}` };
}

// ---------------------------------------------------------------------
// checkSessionFreshnessAction
// ---------------------------------------------------------------------

export type SessionFreshnessResult = {
  fresh: boolean;
  mfaVerifiedAt: string | null;
};

export async function checkSessionFreshnessAction(): Promise<SessionFreshnessResult> {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const { status, data } = await apiFetch('/api/mfa/session-freshness', { method: 'GET' });
  if (
    status === 200 &&
    typeof data === 'object' &&
    data !== null &&
    'fresh' in data &&
    'mfaVerifiedAt' in data
  ) {
    return {
      fresh: Boolean((data as { fresh: unknown }).fresh),
      mfaVerifiedAt:
        typeof (data as { mfaVerifiedAt: unknown }).mfaVerifiedAt === 'string'
          ? String((data as { mfaVerifiedAt: unknown }).mfaVerifiedAt)
          : null,
    };
  }
  return { fresh: false, mfaVerifiedAt: null };
}
