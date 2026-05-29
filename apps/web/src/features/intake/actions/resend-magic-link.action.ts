// T073c (N1) — Server Action resendMagicLinkAction.
//
// Renvoie un nouveau magic link au voyageur. Anti-énumération email :
// la réponse est UNIFORMÉMENT 'sent_or_email_not_found' même si l'email
// n'existe pas (FR-015 + H4 — endpoint NestJS POST
// /api/intake/briefs/resend-magic-link, T082a).
//
// Rate-limit anti-spam appliqué côté backend (5/heure/IP + 3/24h/email,
// FR-019 dérivé) — la Server Action route le 429 vers un message neutre.

'use server';

import { type ResendMagicLinkApiResponse, intakeApiClient } from '../infrastructure/api-client';
import { ResendMagicLinkSchema } from '../schemas';

export type ResendMagicLinkActionResult =
  | { readonly ok: true; readonly data: ResendMagicLinkApiResponse }
  | {
      readonly ok: false;
      readonly code: 'VALIDATION_FAILED' | 'RATE_LIMITED' | 'NETWORK_ERROR';
      readonly message: string;
    };

export async function resendMagicLinkAction(email: string): Promise<ResendMagicLinkActionResult> {
  const parsed = ResendMagicLinkSchema.safeParse({ email });
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: 'Adresse courriel invalide.',
    };
  }

  const result = await intakeApiClient.resendMagicLink(parsed.data.email);
  if (result.ok) {
    return { ok: true, data: result.data };
  }
  if (result.status === 429) {
    return {
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Trop de demandes. Réessayez dans un instant.',
    };
  }
  return {
    ok: false,
    code: 'NETWORK_ERROR',
    message: 'Le serveur ne répond pas. Réessayez dans un instant.',
  };
}
