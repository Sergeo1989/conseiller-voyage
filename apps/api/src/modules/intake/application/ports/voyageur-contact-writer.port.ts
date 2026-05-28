// Port VoyageurContactWriter — mutations du domaine VoyageurContact.

import type { VoyageurContactId } from '@cv/shared/intake';

export interface UpsertContactInput {
  readonly id: VoyageurContactId;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly postalCode: string | null;
}

export interface VoyageurContactWriter {
  /**
   * Upsert atomique sur email. Si le contact existe déjà, met à jour
   * firstName/lastName/phone/postalCode et garde l'`id` existant.
   * Le `id` du payload est ignoré dans ce cas (return de l'`id` réel).
   */
  upsertByEmail(input: UpsertContactInput): Promise<VoyageurContactId>;

  /**
   * Anonymisation Loi 25 — nullify PII + set `anonymizedAt` +
   * `emailHashAfterErasure = SHA-256(email_lowercase)`. Idempotent
   * (trigger SQL T015 garantit que les nullifications ne peuvent pas
   * être annulées).
   */
  applyAnonymisation(args: {
    readonly contactId: VoyageurContactId;
    readonly emailHashAfterErasure: string;
    readonly anonymizedAt: Date;
  }): Promise<void>;
}

export const VOYAGEUR_CONTACT_WRITER = Symbol.for('VoyageurContactWriter');
