// Server Actions Next.js pour le flow d'enrôlement MFA (US1).
//
// Toutes les actions sont marquées `'use server'`. Elles servent de
// façade entre les Client Components React et l'API NestJS — Auth.js
// est vérifié côté serveur, et les payloads validés par Zod avant tout
// fetch réseau.
//
// Cf. specs/005-mfa-conseiller/contracts/server-actions.md.

'use server';

import { randomUUID } from 'node:crypto';
import { auth } from '@/auth';
import { TotpCodeSchema, UuidV4Schema } from '@cv/mfa';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiFetch(
  path: string,
  init: { method: 'POST'; body: object },
): Promise<{ status: number; data: unknown }> {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify(init.body),
    cache: 'no-store',
  });
  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;
  return { status: res.status, data };
}

// ---------------------------------------------------------------------
// startEnrollmentAction
// ---------------------------------------------------------------------

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
  const { status, data } = await apiFetch('/api/mfa/enroll/start', {
    method: 'POST',
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

// ---------------------------------------------------------------------
// confirmEnrollmentAction
// ---------------------------------------------------------------------

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
    return { kind: 'invalid_totp' }; // Zod refus côté form → comme code invalide
  }

  const { status, data } = await apiFetch('/api/mfa/enroll/confirm', {
    method: 'POST',
    body: parsed.data,
  });

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
