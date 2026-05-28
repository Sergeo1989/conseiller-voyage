// Helper HTTP partagé par toutes les Server Actions MFA — élimine la
// duplication d'apiFetch / apiPost qui existait dans 5 fichiers d'actions.
//
// Forward systématique du cookie session vers l'API NestJS (AuthGuard
// + MfaGuard côté API).

import { cookies } from 'next/headers';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface MfaApiResponse {
  readonly status: number;
  readonly data: unknown;
}

export interface MfaApiRequestOptions {
  readonly method?: 'GET' | 'POST';
  readonly body?: object | null;
  readonly idempotencyKey?: string;
}

export async function mfaApiCall(
  path: string,
  options: MfaApiRequestOptions = {},
): Promise<MfaApiResponse> {
  const method = options.method ?? 'POST';
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const headers: Record<string, string> = { Cookie: cookieHeader };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    cache: 'no-store',
  });

  const data = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null;

  return { status: res.status, data };
}
