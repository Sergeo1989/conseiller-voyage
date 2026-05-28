// Server Action — confirmation du flow d'enrôlement MFA (US1).
// Cf. specs/005-mfa-conseiller/contracts/server-actions.md § confirmEnrollmentAction.

'use server';

import { auth } from '@/auth';
import { TotpCodeSchema, UuidV4Schema } from '@cv/mfa';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { mfaApiCall } from '../lib/api-fetch';

const ConfirmInputSchema = z.object({
  enrollmentRequestId: UuidV4Schema,
  totpCode: TotpCodeSchema,
  backupCodesAcknowledged: z.literal(true),
});

export type ConfirmEnrollmentResult =
  | { kind: 'ok' }
  | { kind: 'invalid_totp' }
  | { kind: 'backup_codes_not_acknowledged' }
  | { kind: 'enrollment_not_found' }
  | { kind: 'error'; message: string };

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher d'erreur typé sur 5 cas distincts — extraire serait artificiel
export async function confirmEnrollmentAction(
  formData: FormData,
): Promise<ConfirmEnrollmentResult> {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  const parsed = ConfirmInputSchema.safeParse({
    enrollmentRequestId: formData.get('enrollmentRequestId'),
    totpCode: formData.get('totpCode'),
    backupCodesAcknowledged: formData.get('backupCodesAcknowledged') === 'true',
  });
  if (!parsed.success) {
    return { kind: 'invalid_totp' };
  }

  const { status, data } = await mfaApiCall('/api/mfa/enroll/confirm', { body: parsed.data });

  if (status === 200) return { kind: 'ok' };
  if (status === 400) {
    const code =
      typeof data === 'object' && data !== null && 'code' in data
        ? String((data as { code: unknown }).code)
        : '';
    if (code === 'INVALID_TOTP') return { kind: 'invalid_totp' };
    if (code === 'BACKUP_CODES_NOT_ACKNOWLEDGED') {
      return { kind: 'backup_codes_not_acknowledged' };
    }
  }
  if (status === 404) return { kind: 'enrollment_not_found' };
  return { kind: 'error', message: `Unexpected status ${status}` };
}
