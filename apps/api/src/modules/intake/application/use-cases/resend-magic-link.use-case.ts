// T081c [TDD GREEN] — ResendMagicLinkUseCase (N1).
//
// Réponse uniforme `sent_or_email_not_found` (anti-énumération).
// Si le contact + un brief en pending_verification existent,
// crée un nouveau MagicLinkToken random + enqueue mailer.

import type { MagicLinkTokenId } from '@cv/shared/intake';
import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import { generateClearToken, hashToken } from '../../domain/entities/magic-link-token.entity';
import type {
  MagicLinkMailer,
  MagicLinkTokenWriter,
  VoyageurBriefReader,
  VoyageurContactReader,
} from '../ports';

export interface ResendMagicLinkInput {
  readonly email: string;
  readonly locale: 'fr-CA' | 'en';
}

export type ResendMagicLinkResult = { readonly kind: 'sent_or_email_not_found' };

export interface ResendMagicLinkDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly briefReader: VoyageurBriefReader;
  readonly contactReader: VoyageurContactReader;
  readonly tokenWriter: MagicLinkTokenWriter;
  readonly mailer: MagicLinkMailer;
  readonly magicLinkTtlDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class ResendMagicLinkUseCase {
  constructor(
    @Inject(ResendMagicLinkUseCase.DEPS_TOKEN)
    private readonly deps: ResendMagicLinkDeps,
  ) {}

  static readonly DEPS_TOKEN = Symbol.for('ResendMagicLinkDeps');

  async execute(input: ResendMagicLinkInput): Promise<ResendMagicLinkResult> {
    const contact = await this.deps.contactReader.findByEmail(input.email);
    if (!contact || contact.anonymizedAt !== null || contact.firstName === null) {
      return { kind: 'sent_or_email_not_found' };
    }
    // Lookup explicite des briefs en pending_verification (FR-015 + N1) —
    // on ne resend un magic link que si l'utilisateur a un brief en
    // attente. Si tous ses briefs sont actifs ou anciens, on n'envoie rien
    // (la réponse uniforme protège contre l'énumération).
    const targetBrief = await this.deps.briefReader.findLatestPendingByContactId(contact.id);
    if (!targetBrief) {
      return { kind: 'sent_or_email_not_found' };
    }
    const now = this.deps.clock.now();
    const clearToken = generateClearToken();
    const tokenHash = hashToken(clearToken);
    const tokenId = this.deps.uuid.generate() as MagicLinkTokenId;
    const tokenExpiresAt = new Date(now.getTime() + this.deps.magicLinkTtlDays * MS_PER_DAY);

    await this.deps.tokenWriter.create({
      id: tokenId,
      briefId: targetBrief.id,
      tokenHash,
      purpose: 'verify_email',
      expiresAt: tokenExpiresAt,
    });

    try {
      await this.deps.mailer.send({
        briefId: targetBrief.id,
        toEmail: input.email,
        firstName: contact.firstName,
        clearToken,
        locale: input.locale,
      });
    } catch {
      // FR-013a — l'adapter SES gère le retry. On garde la réponse uniforme.
    }
    return { kind: 'sent_or_email_not_found' };
  }
}
