// T080 — Wrapper Server Actions pour les appels à l'API NestJS.
//
// Garanties posées par ce client :
//   1. Forward du cookie session __Host-cv.session.token vers l'API
//      (sinon AuthGuard rejette 401).
//   2. Header X-Requested-By: web obligatoire sur les mutations
//      (CSRF middleware T021 — rejet 403 sans ça).
//   3. Idempotency-Key auto-généré pour les mutations sensibles
//      (déduplication des doubles-clics — Principe X).
//   4. Erreurs API traduites en exceptions structurées avec status
//      code → le caller (Server Action) peut router vers une UI
//      d'erreur appropriée.
//
// Usage :
//   const result = await apiClient.post('/api/conformite/me/submissions', body);
//   if (!result.ok) throw new ApiError(result.status, result.errorBody);

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { getEnv } from '../../env';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly url: string,
  ) {
    const bodyShort = JSON.stringify(body).slice(0, 200);
    super(`API ${status} on ${url}: ${bodyShort}`);
    this.name = 'ApiError';
  }
}

export interface ApiResult<T> {
  readonly ok: true;
  readonly status: number;
  readonly data: T;
}

export interface ApiFailure {
  readonly ok: false;
  readonly status: number;
  readonly errorBody: unknown;
}

type ApiResponse<T> = ApiResult<T> | ApiFailure;

const COOKIE_NAME = '__Host-cv.session.token';
const SESSION_COOKIE_FALLBACK = 'authjs.session-token';

interface RequestOptions {
  /**
   * Si true, ajoute un header Idempotency-Key auto-généré. Par défaut
   * true sur POST/PUT/PATCH/DELETE. Mettre false explicitement pour
   * des mutations DOIT-être-distinct (rare).
   */
  readonly idempotent?: boolean;
}

async function buildHeaders(method: string, idempotent: boolean): Promise<Headers> {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });

  // Forward du cookie session
  const cookieStore = await cookies();
  const sessionCookie =
    cookieStore.get(COOKIE_NAME)?.value ?? cookieStore.get(SESSION_COOKIE_FALLBACK)?.value;
  if (sessionCookie) {
    // Reconstruit l'en-tête Cookie complet — l'API attend `__Host-` strict
    headers.set('Cookie', `${COOKIE_NAME}=${sessionCookie}`);
  }

  // CSRF — exigé par CsrfProtectionMiddleware (T021) sur toute mutation
  const isMutation = method !== 'GET' && method !== 'HEAD';
  if (isMutation) {
    headers.set('X-Requested-By', 'web');
    if (idempotent) {
      headers.set('Idempotency-Key', randomUUID());
    }
  }

  return headers;
}

async function request<T>(
  path: string,
  init: RequestInit,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = `${getEnv().API_INTERNAL_URL}${path}`;
  const method = init.method ?? 'GET';
  const headers = await buildHeaders(method, options.idempotent ?? true);

  // Merge avec les headers passés par le caller
  for (const [k, v] of new Headers(init.headers).entries()) {
    headers.set(k, v);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    // Server Actions sont server-only : pas de credentials browser
    cache: 'no-store',
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    return { ok: false, status: response.status, errorBody: body };
  }
  return { ok: true, status: response.status, data: body as T };
}

export const apiClient = {
  get<T>(path: string): Promise<ApiResponse<T>> {
    return request<T>(path, { method: 'GET' });
  },

  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body) }, options);
  },

  put<T>(path: string, body: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return request<T>(path, { method: 'PUT', body: JSON.stringify(body) }, options);
  },

  delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return request<T>(path, { method: 'DELETE' }, options);
  },
};

/**
 * Helper pratique : lance ApiError si la réponse n'est pas ok.
 * À utiliser quand on veut court-circuiter dans une Server Action.
 */
export function unwrapApi<T>(result: ApiResponse<T>, path: string): T {
  if (!result.ok) {
    throw new ApiError(result.status, result.errorBody, path);
  }
  return result.data;
}
