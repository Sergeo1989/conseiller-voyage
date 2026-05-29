// T048 [US1] — PrismaVoyageurBriefRepository.
// Implémente VoyageurBriefReader + VoyageurBriefWriter.
//
// Le trigger SQL `intake_voyageur_brief_anonymisation_idempotent` (T015)
// rejette toute tentative de remise du status `anonymized` à autre chose.
// On délègue donc l'invariant à la DB ; côté code on n'a pas à le
// re-vérifier après écriture.

import { prisma } from '@cv/db';
import type {
  BriefStatus,
  ConseillerLanguage,
  TravelBudget,
  TravelFamiliarity,
  TravelSpeciality,
  VoyageurBriefId,
  VoyageurContactId,
} from '@cv/shared/intake';
import { Injectable } from '@nestjs/common';
import type {
  CreateBriefInput,
  VoyageurBriefReader,
  VoyageurBriefRecord,
  VoyageurBriefWriter,
} from '../application/ports';

interface PrismaBriefRow {
  id: string;
  voyageurContactId: string;
  status: BriefStatus;
  submittedAt: Date;
  verifiedAt: Date | null;
  expiresAt: Date;
  consentGivenAt: Date;
  erasureRequestedAt: Date | null;
  anonymizedAt: Date | null;
  abuseMarkedAt: Date | null;
  destinations: unknown;
  departureDate: Date;
  returnDate: Date;
  datesFlexible: boolean;
  datesFlexibilityDays: number | null;
  adultsCount: number;
  childrenAges: unknown;
  infantsCount: number;
  budgetRange: TravelBudget;
  budgetNote: string | null;
  conseillerLanguage: ConseillerLanguage;
  conseillerLanguageOther: string | null;
  speciality: TravelSpeciality;
  specialityOther: string | null;
  familiarity: TravelFamiliarity;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(row: PrismaBriefRow): VoyageurBriefRecord {
  return {
    id: row.id as VoyageurBriefId,
    voyageurContactId: row.voyageurContactId as VoyageurContactId,
    status: row.status,
    submittedAt: row.submittedAt,
    verifiedAt: row.verifiedAt,
    expiresAt: row.expiresAt,
    consentGivenAt: row.consentGivenAt,
    erasureRequestedAt: row.erasureRequestedAt,
    anonymizedAt: row.anonymizedAt,
    abuseMarkedAt: row.abuseMarkedAt,
    destinations: row.destinations as ReadonlyArray<{ country: string; region?: string }>,
    departureDate: row.departureDate,
    returnDate: row.returnDate,
    datesFlexible: row.datesFlexible,
    datesFlexibilityDays: row.datesFlexibilityDays,
    adultsCount: row.adultsCount,
    childrenAges: row.childrenAges as ReadonlyArray<number>,
    infantsCount: row.infantsCount,
    budgetRange: row.budgetRange,
    budgetNote: row.budgetNote,
    conseillerLanguage: row.conseillerLanguage,
    conseillerLanguageOther: row.conseillerLanguageOther,
    speciality: row.speciality,
    specialityOther: row.specialityOther,
    familiarity: row.familiarity,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaVoyageurBriefRepository implements VoyageurBriefReader, VoyageurBriefWriter {
  async findById(id: VoyageurBriefId): Promise<VoyageurBriefRecord | null> {
    const row = await prisma.voyageurBrief.findUnique({ where: { id } });
    return row ? toRecord(row as PrismaBriefRow) : null;
  }

  async findByIdempotencyKey(key: string): Promise<VoyageurBriefRecord | null> {
    const row = await prisma.voyageurBrief.findUnique({ where: { idempotencyKey: key } });
    return row ? toRecord(row as PrismaBriefRow) : null;
  }

  async listActiveByContactId(
    contactId: VoyageurContactId,
  ): Promise<ReadonlyArray<VoyageurBriefRecord>> {
    const rows = await prisma.voyageurBrief.findMany({
      where: { voyageurContactId: contactId, status: 'active' },
      orderBy: { submittedAt: 'desc' },
    });
    return rows.map((r) => toRecord(r as PrismaBriefRow));
  }

  async findLatestPendingByContactId(
    contactId: VoyageurContactId,
  ): Promise<VoyageurBriefRecord | null> {
    const row = await prisma.voyageurBrief.findFirst({
      where: { voyageurContactId: contactId, status: 'pending_verification' },
      orderBy: { submittedAt: 'desc' },
    });
    return row ? toRecord(row as PrismaBriefRow) : null;
  }

  async listUnmatchedSince(args: {
    readonly hoursThreshold: number;
    readonly page: number;
    readonly pageSize: number;
  }): Promise<{
    readonly items: ReadonlyArray<VoyageurBriefRecord>;
    readonly total: number;
  }> {
    const cutoff = new Date(Date.now() - args.hoursThreshold * 60 * 60 * 1000);
    const where = {
      status: 'active' as BriefStatus,
      verifiedAt: { lte: cutoff },
    };
    const [items, total] = await Promise.all([
      prisma.voyageurBrief.findMany({
        where,
        orderBy: { verifiedAt: 'asc' },
        skip: (args.page - 1) * args.pageSize,
        take: args.pageSize,
      }),
      prisma.voyageurBrief.count({ where }),
    ]);
    return { items: items.map((r) => toRecord(r as PrismaBriefRow)), total };
  }

  async create(input: CreateBriefInput): Promise<void> {
    await prisma.voyageurBrief.create({
      data: {
        id: input.id,
        voyageurContactId: input.voyageurContactId,
        status: 'pending_verification',
        expiresAt: input.expiresAt,
        consentGivenAt: input.consentGivenAt,
        destinations: input.destinations as unknown as object[],
        departureDate: input.departureDate,
        returnDate: input.returnDate,
        datesFlexible: input.datesFlexible,
        datesFlexibilityDays: input.datesFlexibilityDays,
        adultsCount: input.adultsCount,
        childrenAges: input.childrenAges as unknown as number[],
        infantsCount: input.infantsCount,
        budgetRange: input.budgetRange,
        budgetNote: input.budgetNote,
        conseillerLanguage: input.conseillerLanguage,
        conseillerLanguageOther: input.conseillerLanguageOther,
        speciality: input.speciality,
        specialityOther: input.specialityOther,
        familiarity: input.familiarity,
        clientIp: input.clientIp,
        userAgent: input.userAgent,
        idempotencyKey: input.idempotencyKey,
      },
    });
  }

  async markVerified(args: {
    readonly briefId: VoyageurBriefId;
    readonly verifiedAt: Date;
  }): Promise<void> {
    await prisma.voyageurBrief.update({
      where: { id: args.briefId },
      data: { status: 'active', verifiedAt: args.verifiedAt },
    });
  }

  async updateStatus(args: {
    readonly briefId: VoyageurBriefId;
    readonly status: BriefStatus;
    readonly erasureRequestedAt?: Date;
    readonly anonymizedAt?: Date;
  }): Promise<void> {
    await prisma.voyageurBrief.update({
      where: { id: args.briefId },
      data: {
        status: args.status,
        ...(args.erasureRequestedAt && { erasureRequestedAt: args.erasureRequestedAt }),
        ...(args.anonymizedAt && { anonymizedAt: args.anonymizedAt }),
      },
    });
  }
}
