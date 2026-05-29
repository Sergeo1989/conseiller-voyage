// T063 — Server Action verifyMagicLinkAction.
// Wrapper Server Action autour de POST /api/intake/briefs/verify.
//
// Le NestJS pose lui-même le cookie session voyageur côté SetCookie
// (FR-014a) ; côté Web on récupère le briefId pour rediriger vers la
// page récap (Phase 4 US2).

'use server';

import { type VerifyMagicLinkApiResponse, intakeApiClient } from '../infrastructure/api-client';
import { VerifyMagicLinkSchema } from '../schemas';

export type VerifyMagicLinkActionResult =
  | { readonly ok: true; readonly data: VerifyMagicLinkApiResponse }
  | {
      readonly ok: false;
      readonly code:
        | 'TOKEN_NOT_FOUND'
        | 'TOKEN_EXPIRED'
        | 'TOKEN_ALREADY_CONSUMED'
        | 'BRIEF_ANONYMISED'
        | 'VALIDATION_FAILED'
        | 'NETWORK_ERROR';
      readonly message: string;
    };

export async function verifyMagicLinkAction(token: string): Promise<VerifyMagicLinkActionResult> {
  const parsed = VerifyMagicLinkSchema.safeParse({ token });
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      message: 'Le lien de vérification n’est pas valide.',
    };
  }

  const result = await intakeApiClient.verifyMagicLink(parsed.data.token);
  if (result.ok) {
    return { ok: true, data: result.data };
  }

  // Mapping des statuts HTTP du NestJS (cf. contracts/http-endpoints.md)
  if (result.status === 404) {
    return {
      ok: false,
      code: 'TOKEN_NOT_FOUND',
      message: 'Ce lien est introuvable. Demandez un nouveau lien.',
    };
  }
  if (result.status === 401) {
    // Le NestJS différencie token_expired vs token_already_consumed via
    // le message. Pour la sécurité on regroupe côté Web (anti-énumération).
    return {
      ok: false,
      code: 'TOKEN_EXPIRED',
      message: 'Ce lien a expiré ou a déjà été utilisé.',
    };
  }
  if (result.status === 410) {
    return {
      ok: false,
      code: 'BRIEF_ANONYMISED',
      message: 'Ce brief a été supprimé. Aucune donnée à afficher.',
    };
  }
  return {
    ok: false,
    code: 'NETWORK_ERROR',
    message: 'Le serveur ne répond pas. Réessayez dans un instant.',
  };
}
