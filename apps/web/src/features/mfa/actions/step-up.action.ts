// Server Action — step-up MFA pour opération sensible (US2).
// Cf. specs/005-mfa-conseiller/contracts/server-actions.md § stepUpAction.

'use server';

import { auth } from '@/auth';
import { IntendedActionSchema, TotpCodeSchema } from '@cv/mfa';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { mfaApiCall } from '../lib/api-fetch';

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

  const { status, data } = await mfaApiCall('/api/mfa/step-up', { body: parsed.data });

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
