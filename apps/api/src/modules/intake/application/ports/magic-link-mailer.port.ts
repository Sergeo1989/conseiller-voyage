// Port MagicLinkMailer — envoi du courriel magic link voyageur via SES.
// Pure interface — le job BullMQ retry (T133, FR-013a) sera derrière l'adapter.

import type { VoyageurBriefId } from '@cv/shared/intake';

export interface SendMagicLinkInput {
  readonly briefId: VoyageurBriefId;
  readonly toEmail: string;
  readonly firstName: string;
  readonly clearToken: string; // hex 64 chars — assemblé dans le lien
  readonly locale: 'fr-CA' | 'en';
}

export interface MagicLinkMailer {
  send(input: SendMagicLinkInput): Promise<void>;
}

export const MAGIC_LINK_MAILER = Symbol.for('MagicLinkMailer');
