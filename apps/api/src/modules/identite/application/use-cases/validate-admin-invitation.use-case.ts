// T113 — ValidateAdminInvitationUseCase (US7 P2).
//
// Pure read — vérif signature JWT + lookup DB. Pas de side effect.

import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_INVITATION_TOKEN_REPOSITORY,
  type AdminInvitationTokenRepository,
} from '../ports/admin-invitation-token-repository.port';
import { TOKEN_ISSUER, type TokenIssuer } from '../ports/token-issuer.port';

export interface ValidateAdminInvitationInput {
  readonly token: string;
}

export type ValidateAdminInvitationResult =
  | {
      readonly valid: true;
      readonly invitationId: string;
      readonly targetEmail: string;
    }
  | { readonly valid: false; readonly code: 'INVALID_OR_EXPIRED_TOKEN' };

@Injectable()
export class ValidateAdminInvitationUseCase {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
    @Inject(ADMIN_INVITATION_TOKEN_REPOSITORY)
    private readonly tokens: AdminInvitationTokenRepository,
  ) {}

  async execute(input: ValidateAdminInvitationInput): Promise<ValidateAdminInvitationResult> {
    const verify = await this.tokenIssuer.verify({
      token: input.token,
      expectedPurpose: 'admin_invitation',
    });
    if (!verify.ok) return { valid: false, code: 'INVALID_OR_EXPIRED_TOKEN' };
    const row = await this.tokens.findByNonceUnconsumedNotExpired(verify.payload.nonce, new Date());
    if (!row) return { valid: false, code: 'INVALID_OR_EXPIRED_TOKEN' };
    return {
      valid: true,
      invitationId: row.id,
      targetEmail: row.targetEmail,
    };
  }
}
