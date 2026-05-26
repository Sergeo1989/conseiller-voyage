// T087 — LogoutUseCase (US4 P1 MVP).
//
// DELETE auth_sessions WHERE sessionToken = currentSessionToken (la
// session courante uniquement — les autres sessions du même user restent
// actives, FR-027). Audit logout avec hash SHA-256 du sessionToken pour
// traçabilité sans persister le token en clair.

import { createHash } from 'node:crypto';
import { prisma } from '@cv/db';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';

export interface LogoutInput {
  readonly sessionToken: string;
  readonly userId: string;
  readonly actorIp?: string;
}

export type LogoutResult = { readonly kind: 'ok' } | { readonly kind: 'no_session' };

@Injectable()
export class LogoutUseCase {
  constructor(@Inject(AUTH_AUDIT_WRITER) private readonly audit: AuthAuditWriter) {}

  async execute(input: LogoutInput): Promise<LogoutResult> {
    const deleted = await prisma.authSession.deleteMany({
      where: { sessionToken: input.sessionToken, userId: input.userId },
    });
    if (deleted.count === 0) {
      return { kind: 'no_session' };
    }
    const sessionTokenHash = createHash('sha256')
      .update(input.sessionToken, 'utf8')
      .digest('base64');
    await this.audit.append({
      eventType: 'logout',
      targetUserId: input.userId,
      actorIp: input.actorIp ?? null,
      metadata: { sessionTokenHash },
    });
    return { kind: 'ok' };
  }
}
