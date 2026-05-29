// T061 — Wrapper typé des endpoints /api/intake/* côté Web.
// Réutilise le client HTTP partagé (`@/shared/lib/http`) qui gère :
//   - forward du cookie session voyageur (__Host-cv.intake.token /
//     cv.intake.session) en mode forward explicite
//   - header X-Requested-By: web obligatoire (CSRF)
//   - Idempotency-Key auto sur les mutations
//
// Note : le cookie voyageur intake utilise une convention différente du
// cookie session admin/conseiller. Le client HTTP du shared/ forward
// uniquement les cookies session classiques — pour intake on relaie le
// cookie via `cookies().get(...)` explicite dans les Server Actions.

import { type ApiFailure, type ApiResult, apiClient } from '@/shared/lib/http';

type ApiResponse<T> = ApiResult<T> | ApiFailure;

export interface SubmitBriefApiResponse {
  readonly briefId: string;
  readonly status: 'pending_verification';
  readonly emailSent: boolean;
}

export interface VerifyMagicLinkApiResponse {
  readonly briefId: string;
  readonly status: 'active';
  readonly expiresAt: string;
}

export interface ResendMagicLinkApiResponse {
  readonly status: 'sent_or_email_not_found';
}

export const intakeApiClient = {
  submitBrief(body: unknown): Promise<ApiResponse<SubmitBriefApiResponse>> {
    return apiClient.post<SubmitBriefApiResponse>('/api/intake/briefs', body);
  },

  verifyMagicLink(token: string): Promise<ApiResponse<VerifyMagicLinkApiResponse>> {
    return apiClient.post<VerifyMagicLinkApiResponse>('/api/intake/briefs/verify', { token });
  },

  resendMagicLink(email: string): Promise<ApiResponse<ResendMagicLinkApiResponse>> {
    // Route placeholder — l'endpoint backend (T082a) prend :id mais à ce
    // stade le voyageur n'a pas accès à son briefId. La Server Action
    // (T073c) traduira la requête vers l'endpoint final.
    return apiClient.post<ResendMagicLinkApiResponse>('/api/intake/briefs/resend-magic-link', {
      email,
    });
  },
};
