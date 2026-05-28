// T035 — Entité VoyageurContact (PII isolée).
// Anonymisation Loi 25 : nullify PII, conserve emailHashAfterErasure
// (anti-réintroduction PII via re-soumission immédiate).
// Cf. data-model.md *Entity: VoyageurContact*.

import { createHash } from 'node:crypto';
import type { VoyageurContactId } from '@cv/shared/intake';

export interface VoyageurContact {
  readonly id: VoyageurContactId;
  readonly email: string | null;
  readonly emailHashAfterErasure: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly phone: string | null;
  readonly postalCode: string | null;
  readonly briefsCount24h: number;
  readonly briefsCount24hWindowStart: Date | null;
  readonly anonymizedAt: Date | null;
}

/**
 * Anonymise le contact en place — nullify PII, set `emailHashAfterErasure`
 * = SHA-256(email lowercase), set `anonymizedAt`. Idempotent : si déjà
 * anonymisé, renvoie l'entrée telle quelle.
 *
 * Le trigger SQL `intake_voyageur_contact_anonymisation_idempotent` (T015)
 * garantit que cette transition est irréversible côté DB même si le code
 * applicatif tente une réintroduction.
 */
export function applyAnonymisation(contact: VoyageurContact, now: Date): VoyageurContact {
  if (contact.anonymizedAt !== null) {
    return contact;
  }
  const emailHash =
    contact.email !== null
      ? createHash('sha256').update(contact.email.toLowerCase()).digest('hex')
      : null;
  return {
    ...contact,
    email: null,
    emailHashAfterErasure: emailHash,
    firstName: null,
    lastName: null,
    phone: null,
    postalCode: null,
    anonymizedAt: now,
  };
}

/** Vrai si le contact est déjà anonymisé Loi 25 (terminal). */
export function isAnonymised(contact: VoyageurContact): boolean {
  return contact.anonymizedAt !== null;
}
