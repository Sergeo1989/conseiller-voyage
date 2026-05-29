// Helpers fetch côté Server Component admin.

import { getEnv } from '@/env';
import type { BriefSummary } from '@cv/shared/intake';
import { cookies } from 'next/headers';

const SESSION_COOKIE = '__Host-cv.session.token';
const SESSION_COOKIE_FALLBACK = 'authjs.session-token';

async function buildAdminCookieHeader(): Promise<string | null> {
  const store = await cookies();
  const session = store.get(SESSION_COOKIE) ?? store.get(SESSION_COOKIE_FALLBACK);
  if (!session) return null;
  return `${SESSION_COOKIE}=${session.value}`;
}

export async function fetchUnmatchedBriefs(args: {
  readonly page: number;
  readonly pageSize: number;
}): Promise<{
  ok: boolean;
  status: number;
  data?: {
    items: ReadonlyArray<BriefSummary>;
    total: number;
    page: number;
    pageSize: number;
  };
}> {
  const cookie = await buildAdminCookieHeader();
  if (!cookie) return { ok: false, status: 401 };
  const url = `${getEnv().API_INTERNAL_URL}/api/intake/admin/unmatched?page=${args.page}&pageSize=${args.pageSize}`;
  const response = await fetch(url, {
    headers: { Cookie: cookie, 'X-Requested-By': 'web' },
    cache: 'no-store',
  });
  if (!response.ok) return { ok: false, status: response.status };
  const data = (await response.json()) as {
    items: ReadonlyArray<BriefSummary>;
    total: number;
    page: number;
    pageSize: number;
  };
  return { ok: true, status: 200, data };
}

export async function fetchAdminBriefDetail(briefId: string): Promise<{
  ok: boolean;
  status: number;
  data?: BriefSummary;
}> {
  const cookie = await buildAdminCookieHeader();
  if (!cookie) return { ok: false, status: 401 };
  const url = `${getEnv().API_INTERNAL_URL}/api/intake/admin/briefs/${encodeURIComponent(briefId)}`;
  const response = await fetch(url, {
    headers: { Cookie: cookie, 'X-Requested-By': 'web' },
    cache: 'no-store',
  });
  if (!response.ok) return { ok: false, status: response.status };
  const data = (await response.json()) as BriefSummary;
  return { ok: true, status: 200, data };
}
