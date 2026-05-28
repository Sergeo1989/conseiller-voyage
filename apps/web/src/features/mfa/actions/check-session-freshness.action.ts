// Server Action — check de la fraîcheur de session MFA (US2).
// Lecture seule, utilisée par le step-up gate pour décider d'ouvrir
// le modal ou d'exécuter directement l'action sensible.

'use server';

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { mfaApiCall } from '../lib/api-fetch';

export type SessionFreshnessResult = {
  fresh: boolean;
  mfaVerifiedAt: string | null;
};

export async function checkSessionFreshnessAction(): Promise<SessionFreshnessResult> {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const { status, data } = await mfaApiCall('/api/mfa/session-freshness', { method: 'GET' });
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
