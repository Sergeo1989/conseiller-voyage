// Server Action — démarrage du flow d'enrôlement MFA (US1).
// Cf. specs/005-mfa-conseiller/contracts/server-actions.md § startEnrollmentAction.

'use server';

import { randomUUID } from 'node:crypto';
import { auth } from '@/auth';
import { UuidV4Schema } from '@cv/mfa';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { mfaApiCall } from '../lib/api-fetch';

export type StartEnrollmentResult =
  | {
      kind: 'ok';
      qrCodeKeyUri: string;
      secretBase32: string;
      backupCodes: string[];
      enrollmentRequestId: string;
    }
  | { kind: 'already_enrolled' }
  | { kind: 'rate_limited'; unlockAt: string }
  | { kind: 'error'; message: string };

export async function startEnrollmentAction(): Promise<StartEnrollmentResult> {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const enrollmentRequestId = randomUUID();
  const { status, data } = await mfaApiCall('/api/mfa/enroll/start', {
    body: { enrollmentRequestId },
  });

  if (status === 200) {
    const parsed = z
      .object({
        secretBase32: z.string(),
        keyUri: z.string(),
        backupCodes: z.array(z.string()),
        enrollmentRequestId: UuidV4Schema,
      })
      .safeParse(data);
    if (!parsed.success) {
      return { kind: 'error', message: 'Invalid response from API' };
    }
    return {
      kind: 'ok',
      qrCodeKeyUri: parsed.data.keyUri,
      secretBase32: parsed.data.secretBase32,
      backupCodes: parsed.data.backupCodes,
      enrollmentRequestId: parsed.data.enrollmentRequestId,
    };
  }
  if (status === 409) {
    return { kind: 'already_enrolled' };
  }
  if (status === 429) {
    const unlockAt =
      typeof data === 'object' && data !== null && 'unlockAt' in data
        ? String((data as { unlockAt: unknown }).unlockAt)
        : '';
    return { kind: 'rate_limited', unlockAt };
  }
  return { kind: 'error', message: `Unexpected status ${status}` };
}
