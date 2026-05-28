// T028 — Port repository des slugs réservés à vie (feature 007, FR-015 / SC-007).
//
// Append-only au niveau Postgres (trigger profile_slug_reservations_no_*
// posé par la migration 20260527174200_profil_immutability_triggers).
// Aucune UPDATE / DELETE possible — préservation invariant SC-007.

import type { Prisma } from '@cv/db';

export type SlugReservationRaison = 'loi25' | 'revocation_permanente';

export interface SlugReservation {
  readonly slug: string;
  readonly raison: SlugReservationRaison;
  readonly reservedAt: Date;
  /** NULL après anonymisation Loi 25 (cf. ADR-0015 spec 007). */
  readonly conseillerIdOrigine: string | null;
}

export interface ReserveSlugInput {
  readonly slug: string;
  readonly raison: SlugReservationRaison;
  /** NULL pour Loi 25 (cf. ADR-0015). */
  readonly conseillerIdOrigine: string | null;
}

export interface SlugReservationRepository {
  /** Inscrit un slug dans le registre (append-only). Idempotent. */
  reserve(input: ReserveSlugInput, tx?: Prisma.TransactionClient): Promise<void>;
  /** Vérifie si un slug est réservé. Utilisé par genererSlugUnique. */
  isReserved(slug: string): Promise<boolean>;
  /** Liste tous les slugs réservés (pour passer au domaine pur). */
  listAll(): Promise<ReadonlySet<string>>;
}

export const SLUG_RESERVATION_REPOSITORY = Symbol.for('SlugReservationRepository');
