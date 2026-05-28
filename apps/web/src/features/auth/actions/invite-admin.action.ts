// Server Action — invitation d'un nouveau admin (US7).

'use server';

import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { AUTH_API_BASE_URL } from '../lib/api';

export type InviteAdminResult =
  | { readonly kind: 'ok'; readonly invitationId: string; readonly expiresAt: string }
  | { readonly kind: 'self_invitation_forbidden' }
  | { readonly kind: 'target_already_registered' }
  | { readonly kind: 'invitation_already_active'; readonly expiresAt: string }
  | { readonly kind: 'error' };

export async function inviteAdminAction(targetEmail: string): Promise<InviteAdminResult> {
  const cookieStore = await cookies();
  const cookie = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const res = await fetch(`${AUTH_API_BASE_URL}/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      'Idempotency-Key': randomBytes(16).toString('hex'),
    },
    body: JSON.stringify({ targetEmail }),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => null)) as {
    invitationId?: string;
    expiresAt?: string;
    code?: string;
  } | null;
  if (res.status === 202 && data?.invitationId && data.expiresAt) {
    return { kind: 'ok', invitationId: data.invitationId, expiresAt: data.expiresAt };
  }
  if (data?.code === 'SELF_INVITATION_FORBIDDEN') return { kind: 'self_invitation_forbidden' };
  if (data?.code === 'TARGET_EMAIL_ALREADY_REGISTERED')
    return { kind: 'target_already_registered' };
  if (data?.code === 'INVITATION_ALREADY_ACTIVE' && data.expiresAt) {
    return { kind: 'invitation_already_active', expiresAt: data.expiresAt };
  }
  return { kind: 'error' };
}
