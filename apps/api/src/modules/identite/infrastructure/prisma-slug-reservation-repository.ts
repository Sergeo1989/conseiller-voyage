// T038 — PrismaSlugReservationRepository (feature 007, FR-015 + SC-007).
//
// Impl du port SlugReservationRepository (T028). Append-only enforced
// par les triggers Postgres `profile_slug_reservations_no_*` posés par
// la migration 20260527174200_profil_immutability_triggers.

import { type Prisma, prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  ReserveSlugInput,
  SlugReservationRepository,
} from '../application/ports/slug-reservation-repository.port';

type Db = Prisma.TransactionClient | typeof prisma;

@Injectable()
export class PrismaSlugReservationRepository implements SlugReservationRepository {
  private db(tx?: Prisma.TransactionClient): Db {
    return tx ?? prisma;
  }

  async reserve(input: ReserveSlugInput, tx?: Prisma.TransactionClient): Promise<void> {
    // Idempotent : si le slug est déjà réservé (ré-anonymisation
    // accidentelle), on ne refait pas l'INSERT.
    await this.db(tx).slugReservation.upsert({
      where: { slug: input.slug },
      create: {
        slug: input.slug,
        raison: input.raison,
        conseillerIdOrigine: input.conseillerIdOrigine,
      },
      update: {}, // append-only — on ne modifie jamais une ligne existante
    });
  }

  async isReserved(slug: string): Promise<boolean> {
    const row = await prisma.slugReservation.findUnique({
      where: { slug },
      select: { slug: true },
    });
    return row !== null;
  }

  async listAll(): Promise<ReadonlySet<string>> {
    const rows = await prisma.slugReservation.findMany({ select: { slug: true } });
    return new Set(rows.map((r) => r.slug));
  }
}
