// T049 [US1] — PrismaVoyageurContactRepository.
// Implémente VoyageurContactReader + VoyageurContactWriter.
//
// upsertByEmail est atomique côté DB via Prisma upsert (email unique).
// Le trigger SQL `intake_voyageur_contact_anonymisation_idempotent` (T015)
// garantit que applyAnonymisation est irréversible — on n'a pas à le
// re-vérifier côté code.

import { prisma } from '@cv/db';
import type { VoyageurContactId } from '@cv/shared/intake';
import { Injectable } from '@nestjs/common';
import type {
  UpsertContactInput,
  VoyageurContactReader,
  VoyageurContactRecord,
  VoyageurContactWriter,
} from '../application/ports';

interface PrismaContactRow {
  id: string;
  email: string | null;
  emailHashAfterErasure: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  postalCode: string | null;
  briefsCount24h: number;
  briefsCount24hWindowStart: Date | null;
  createdAt: Date;
  updatedAt: Date;
  anonymizedAt: Date | null;
}

function toRecord(row: PrismaContactRow): VoyageurContactRecord {
  return {
    id: row.id as VoyageurContactId,
    email: row.email,
    emailHashAfterErasure: row.emailHashAfterErasure,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    postalCode: row.postalCode,
    briefsCount24h: row.briefsCount24h,
    briefsCount24hWindowStart: row.briefsCount24hWindowStart,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    anonymizedAt: row.anonymizedAt,
  };
}

@Injectable()
export class PrismaVoyageurContactRepository
  implements VoyageurContactReader, VoyageurContactWriter
{
  async findById(id: VoyageurContactId): Promise<VoyageurContactRecord | null> {
    const row = await prisma.voyageurContact.findUnique({ where: { id } });
    return row ? toRecord(row as PrismaContactRow) : null;
  }

  async findByEmail(email: string): Promise<VoyageurContactRecord | null> {
    const row = await prisma.voyageurContact.findUnique({
      where: { email: email.toLowerCase() },
    });
    return row ? toRecord(row as PrismaContactRow) : null;
  }

  async findByEmailHashAfterErasure(hash: string): Promise<VoyageurContactRecord | null> {
    const row = await prisma.voyageurContact.findFirst({
      where: { emailHashAfterErasure: hash },
    });
    return row ? toRecord(row as PrismaContactRow) : null;
  }

  async upsertByEmail(input: UpsertContactInput): Promise<VoyageurContactId> {
    const row = await prisma.voyageurContact.upsert({
      where: { email: input.email.toLowerCase() },
      create: {
        id: input.id,
        email: input.email.toLowerCase(),
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        postalCode: input.postalCode,
      },
      update: {
        // Sur upsert d'un contact existant, on remet à jour les PII
        // courantes (le voyageur peut avoir mis à jour son nom/téléphone).
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        postalCode: input.postalCode,
      },
    });
    return row.id as VoyageurContactId;
  }

  async applyAnonymisation(args: {
    readonly contactId: VoyageurContactId;
    readonly emailHashAfterErasure: string;
    readonly anonymizedAt: Date;
  }): Promise<void> {
    // Le trigger SQL T015 garantit l'idempotence côté DB : une fois
    // `anonymizedAt IS NOT NULL`, les colonnes PII ne peuvent plus
    // revenir à des valeurs non-NULL. Pas besoin de vérification code.
    await prisma.voyageurContact.update({
      where: { id: args.contactId },
      data: {
        email: null,
        emailHashAfterErasure: args.emailHashAfterErasure,
        firstName: null,
        lastName: null,
        phone: null,
        postalCode: null,
        anonymizedAt: args.anonymizedAt,
      },
    });
  }
}
