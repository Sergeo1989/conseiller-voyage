// T083 — IntakeAuthGuard.
//
// Valide le cookie session voyageur (__Host-cv.intake.token en prod ou
// cv.intake.session en dev), résout le MagicLinkToken correspondant
// (hash SHA-256 du cookie value), et attache `contactId` à la requête
// pour que les handlers downstream puissent l'utiliser.
//
// Refuse si :
//   - cookie absent
//   - tokenHash inconnu en DB
//   - brief.status === 'anonymized' (Loi 25)
//
// Le token utilisé est le même que celui qui a servi à vérifier l'email
// (purpose=verify_email, consumedAt non-null après US1). N8 résolu :
// le `view_brief_status` purpose distinct sera introduit en Phase 8
// polish si besoin ; pour MVP US2 on partage le token verify_email.

import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import {
  MAGIC_LINK_TOKEN_WRITER,
  type MagicLinkTokenWriter,
  VOYAGEUR_BRIEF_READER,
  type VoyageurBriefReader,
} from '../../application/ports';
import { hashToken } from '../../domain/entities/magic-link-token.entity';

const PROD_COOKIE_NAME = '__Host-cv.intake.token';
const DEV_COOKIE_NAME = 'cv.intake.session';

interface RequestLike {
  cookies?: Record<string, string | undefined>;
  intakeContext?: {
    contactId: string;
    briefId: string;
  };
}

@Injectable()
export class IntakeAuthGuard implements CanActivate {
  constructor(
    @Inject(MAGIC_LINK_TOKEN_WRITER) private readonly tokens: MagicLinkTokenWriter,
    @Inject(VOYAGEUR_BRIEF_READER) private readonly briefs: VoyageurBriefReader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestLike>();
    const clearToken = req.cookies?.[PROD_COOKIE_NAME] ?? req.cookies?.[DEV_COOKIE_NAME];
    if (!clearToken) return false;

    const token = await this.tokens.findByHash(hashToken(clearToken));
    if (!token || token.consumedAt === null) return false;

    const brief = await this.briefs.findById(token.briefId);
    if (!brief || brief.status === 'anonymized') return false;

    req.intakeContext = {
      contactId: brief.voyageurContactId,
      briefId: brief.id,
    };
    return true;
  }
}
