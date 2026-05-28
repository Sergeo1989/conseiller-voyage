// Port MagicLinkTokenWriter — mutations du domaine MagicLinkToken.
// Lectures sont co-localisées (lookup par tokenHash est atomique avec
// markConsumed dans verify-magic-link use case T047).

import type { MagicLinkTokenId, VoyageurBriefId } from '@cv/shared/intake';

export type MagicLinkPurpose = 'verify_email' | 'view_brief_status';

export interface CreateTokenInput {
  readonly id: MagicLinkTokenId;
  readonly briefId: VoyageurBriefId;
  readonly tokenHash: string; // SHA-256 hex 64 chars
  readonly purpose: MagicLinkPurpose;
  readonly expiresAt: Date;
}

export interface MagicLinkTokenRecord {
  readonly id: MagicLinkTokenId;
  readonly briefId: VoyageurBriefId;
  readonly tokenHash: string;
  readonly purpose: MagicLinkPurpose;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly createdAt: Date;
}

export interface MagicLinkTokenWriter {
  create(input: CreateTokenInput): Promise<void>;

  /** Lookup par hash SHA-256 (jamais par clear token). */
  findByHash(tokenHash: string): Promise<MagicLinkTokenRecord | null>;

  /** Marque consommé (transition unused → consumed, idempotent). */
  markConsumed(args: {
    readonly tokenId: MagicLinkTokenId;
    readonly consumedAt: Date;
  }): Promise<void>;

  /** Marque les tokens `verify_email` non consommés d'un brief comme expirés. */
  expirePendingByBrief(args: {
    readonly briefId: VoyageurBriefId;
    readonly purpose: MagicLinkPurpose;
    readonly expiredAt: Date;
  }): Promise<number>;
}

export const MAGIC_LINK_TOKEN_WRITER = Symbol.for('MagicLinkTokenWriter');
