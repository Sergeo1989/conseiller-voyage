// Server Action — vérification TOTP au login (US3).
// Cf. specs/005-mfa-conseiller/contracts/server-actions.md § verifyTotpAction.

'use server';

import { auth } from '@/auth';
import { TotpCodeSchema } from '@cv/mfa';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { mfaApiCall } from '../lib/api-fetch';

const VerifyTotpInputSchema = z.object({
  totpCode: TotpCodeSchema,
});

export type VerifyTotpActionResult =
  | { kind: 'ok' }
  | { kind: 'invalid'; attemptsRemaining: number }
  | { kind: 'locked'; unlockAt: string }
  | { kind: 'error'; message: string };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher de réponse API typé sur 4 cas
export async function verifyTotpAction(formData: FormData): Promise<VerifyTotpActionResult> {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const parsed = VerifyTotpInputSchema.safeParse({ totpCode: formData.get('totpCode') });
  if (!parsed.success) return { kind: 'invalid', attemptsRemaining: 5 };

  const { status, data } = await mfaApiCall('/api/mfa/verify', { body: parsed.data });

  if (status === 200 && typeof data === 'object' && data !== null && 'kind' in data) {
    const kind = (data as { kind: unknown }).kind;
    if (kind === 'ok') return { kind: 'ok' };
    if (kind === 'invalid') {
      const remaining =
        'attemptsRemaining' in data
          ? Number((data as { attemptsRemaining: unknown }).attemptsRemaining)
          : 0;
      return { kind: 'invalid', attemptsRemaining: remaining };
    }
  }
  if (status === 429 && typeof data === 'object' && data !== null && 'unlockAt' in data) {
    return { kind: 'locked', unlockAt: String((data as { unlockAt: unknown }).unlockAt) };
  }
  return { kind: 'error', message: `Unexpected status ${status}` };
}
