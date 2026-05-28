// Server Action — régénération des codes de secours (US6).
// Step-up MFA requis côté API.

'use server';

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { mfaApiCall } from '../lib/api-fetch';

export type RegenerateBackupCodesResult =
  | { kind: 'ok'; backupCodes: string[] }
  | { kind: 'stepup_required' }
  | { kind: 'error'; message: string };

export async function regenerateBackupCodesAction(): Promise<RegenerateBackupCodesResult> {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { status, data } = await mfaApiCall('/api/mfa/regenerate-backup-codes', { body: {} });

  if (status === 200 && typeof data === 'object' && data !== null) {
    const codes = (data as { backupCodes?: unknown }).backupCodes;
    if (Array.isArray(codes)) {
      return { kind: 'ok', backupCodes: codes.map(String) };
    }
  }
  if (status === 403 && typeof data === 'object' && data !== null) {
    const code = String((data as { code?: unknown }).code ?? '');
    if (code === 'STEP_UP_REQUIRED') return { kind: 'stepup_required' };
  }
  return { kind: 'error', message: `Unexpected status ${status}` };
}
