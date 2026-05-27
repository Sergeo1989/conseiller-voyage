// T079 — ResendEmailVerificationUseCase (US3 P1 MVP).
//
// Renvoie un courriel de vérification pour un compte non vérifié.
// Rate-limit FR-015 : max 3 renvois par heure par compte (compté sur les
// INSERTs de tokens dans la dernière heure).
//
// Anti-énumération : retour uniforme `{ kind: 'ok' }` que l'email existe
// ou non, qu'il soit déjà vérifié ou non, qu'on dépasse le rate-limit ou
// non. Side effects conditionnels seulement.

import { normalizeEmail } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import { TOKEN_ISSUER, type TokenIssuer } from '../ports/token-issuer.port';

export interface ResendEmailVerificationInput {
  readonly emailRaw: string;
  readonly actorIp?: string;
}

export interface ResendEmailVerificationResult {
  readonly kind: 'ok';
}

const EMAIL_VERIFICATION_TTL_SEC = 24 * 60 * 60; // 24 h
const MAX_RESEND_PER_HOUR = 3;
const RESEND_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class ResendEmailVerificationUseCase {
  constructor(
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuer,
    @Inject(AUTH_AUDIT_WRITER) private readonly audit: AuthAuditWriter,
  ) {}

  async execute(input: ResendEmailVerificationInput): Promise<ResendEmailVerificationResult> {
    const email = normalizeEmail(input.emailRaw);
    const user = await prisma.authUser.findUnique({
      where: { email },
      select: { id: true, name: true, emailVerified: true },
    });
    // Cas anti-énumération : compte inexistant OU déjà vérifié → silence.
    if (!user || user.emailVerified !== null) {
      return { kind: 'ok' };
    }

    // Rate-limit : COUNT tokens créés dans la dernière heure.
    const since = new Date(Date.now() - RESEND_WINDOW_MS);
    const recent = await prisma.emailVerificationToken.count({
      where: { userId: user.id, createdAt: { gte: since } },
    });
    if (recent >= MAX_RESEND_PER_HOUR) {
      await this.audit.append({
        eventType: 'signup', // pas d'event type dédié — utilise signup avec metadata
        targetUserId: user.id,
        targetEmail: email,
        actorIp: input.actorIp ?? null,
        metadata: { resend_throttled: true, recent_count: recent },
      });
      return { kind: 'ok' };
    }

    // Génère un nouveau token + INSERT + outbox + audit.
    const now = new Date();
    const issued = await this.tokenIssuer.issue({
      purpose: 'email_verification',
      userId: user.id,
      ttlSec: EMAIL_VERIFICATION_TTL_SEC,
      now,
    });

    const firstName = user.name?.split(' ')[0] ?? 'utilisateur';
    await prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          jwtNonce: issued.nonce,
          expiresAt: issued.expiresAt,
        },
      });
      await tx.authOutboxEmail.create({
        data: {
          recipientUserId: user.id,
          recipientEmail: email,
          templateKind: 'email_verification',
          payload: {
            firstName,
            token: issued.token,
            expiresAt: issued.expiresAt.toISOString(),
          },
        },
      });
    });

    await this.audit.append({
      eventType: 'signup', // resend = relance signup post-création
      targetUserId: user.id,
      targetEmail: email,
      actorIp: input.actorIp ?? null,
      metadata: { resend: true, recent_count: recent + 1 },
    });

    return { kind: 'ok' };
  }
}
