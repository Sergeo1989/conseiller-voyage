// Port VoyageurContactReader — lectures du domaine VoyageurContact.

import type { VoyageurContactId } from '@cv/shared/intake';

export interface VoyageurContactRecord {
  readonly id: VoyageurContactId;
  readonly email: string | null;
  readonly emailHashAfterErasure: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly phone: string | null;
  readonly postalCode: string | null;
  readonly briefsCount24h: number;
  readonly briefsCount24hWindowStart: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly anonymizedAt: Date | null;
}

export interface VoyageurContactReader {
  findById(id: VoyageurContactId): Promise<VoyageurContactRecord | null>;
  /** Lookup case-insensitive (email stocké lower-cased par Zod). */
  findByEmail(email: string): Promise<VoyageurContactRecord | null>;
  /**
   * Lookup par hash post-anonymisation — utilisé pour anti-réintroduction
   * (le code Server Action ne doit JAMAIS recevoir l'email clair via cette
   * voie).
   */
  findByEmailHashAfterErasure(hash: string): Promise<VoyageurContactRecord | null>;
}

export const VOYAGEUR_CONTACT_READER = Symbol.for('VoyageurContactReader');
