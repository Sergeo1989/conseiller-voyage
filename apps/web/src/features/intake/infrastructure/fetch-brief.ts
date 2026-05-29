// Helpers de fetch côté Server Component pour US2 — BriefRecap.
// Forward du cookie session voyageur (__Host-cv.intake.token /
// cv.intake.session) vers l'API NestJS.

import { getEnv } from '@/env';
import type { BriefSummary } from '@cv/shared/intake';
import { cookies } from 'next/headers';

const PROD_COOKIE_NAME = '__Host-cv.intake.token';
const DEV_COOKIE_NAME = 'cv.intake.session';

async function buildCookieHeader(): Promise<string | null> {
  const store = await cookies();
  const prod = store.get(PROD_COOKIE_NAME);
  if (prod) return `${PROD_COOKIE_NAME}=${prod.value}`;
  const dev = store.get(DEV_COOKIE_NAME);
  if (dev) return `${DEV_COOKIE_NAME}=${dev.value}`;
  return null;
}

export interface FetchBriefResult {
  readonly ok: boolean;
  readonly status: number;
  readonly data?: BriefSummary;
}

export async function fetchBriefById(briefId: string): Promise<FetchBriefResult> {
  const cookie = await buildCookieHeader();
  if (!cookie) return { ok: false, status: 401 };
  const url = `${getEnv().API_INTERNAL_URL}/api/intake/briefs/${encodeURIComponent(briefId)}`;
  const response = await fetch(url, {
    headers: { Cookie: cookie, 'X-Requested-By': 'web' },
    cache: 'no-store',
  });
  if (!response.ok) return { ok: false, status: response.status };
  const data = (await response.json()) as BriefSummary;
  return { ok: true, status: 200, data };
}

export async function fetchBriefsByEmail(): Promise<{
  ok: boolean;
  status: number;
  briefs: ReadonlyArray<BriefSummary>;
}> {
  const cookie = await buildCookieHeader();
  if (!cookie) return { ok: false, status: 401, briefs: [] };
  const url = `${getEnv().API_INTERNAL_URL}/api/intake/briefs/by-email`;
  const response = await fetch(url, {
    headers: { Cookie: cookie, 'X-Requested-By': 'web' },
    cache: 'no-store',
  });
  if (!response.ok) return { ok: false, status: response.status, briefs: [] };
  const body = (await response.json()) as { briefs: ReadonlyArray<BriefSummary> };
  return { ok: true, status: 200, briefs: body.briefs };
}
