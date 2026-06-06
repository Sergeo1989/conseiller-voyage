// T025 [US1] / T040 [US2] — PrismaLeadRepository (LeadWriter + LeadReader).
//
// - createLead : insert idempotent (UNIQUE conseiller × MR ; P2002 → duplicate
//   avec lookup du leadId existant).
// - appendTransition : transaction { updateMany guard currentState = expected
//   (concurrence optimiste FR-020) → insert transition }.
// - closeLeadsSystem : transaction { ferme en perdu les leads non terminaux
//   d'un MR + 1 transition systeme par lead }.
// - lectures : findById (+ history), listByConseiller, findActiveByBrief...,
//   findActiveMatchingResultsWithoutLead (sweep).

import { type Prisma, prisma } from '@cv/db';
import type { LeadState } from '@cv/shared/matching';
import { Injectable } from '@nestjs/common';
import type {
  AppendTransitionInput,
  AppendTransitionResult,
  CloseLeadsSystemInput,
  CloseSupersededLeadsInput,
  CreateLeadInput,
  CreateLeadResult,
  LeadReader,
  LeadRecord,
  LeadWithHistory,
  LeadWriter,
  ListLeadsByConseillerFilter,
  ListLeadsByConseillerResult,
  MatchingResultWithoutLead,
} from '../application/ports';

// Mutable (Prisma `in` n'accepte pas ReadonlyArray). États non terminaux.
const ACTIVE_STATES: LeadState[] = ['envoye', 'vu', 'accepte', 'devis_envoye'];

@Injectable()
export class PrismaLeadRepository implements LeadWriter, LeadReader {
  // ---------------------------------------------------------------- writer
  async createLead(input: CreateLeadInput): Promise<CreateLeadResult> {
    try {
      const created = await prisma.lead.create({
        data: {
          id: input.id,
          matchingResultId: input.matchingResultId,
          matchingResultEntryPosition: input.matchingResultEntryPosition,
          conseillerId: input.conseillerId,
          briefId: input.briefId,
          currentState: 'envoye',
          scoreFinal: input.scoreFinal,
          boosted: input.boosted,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        },
        select: { id: true },
      });
      return { kind: 'created', leadId: created.id };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await prisma.lead.findUnique({
        where: {
          conseillerId_matchingResultId: {
            conseillerId: input.conseillerId,
            matchingResultId: input.matchingResultId,
          },
        },
        select: { id: true },
      });
      // L'existant est garanti présent (la contrainte vient d'être violée).
      return { kind: 'duplicate', leadId: existing?.id ?? input.id };
    }
  }

  async appendTransition(input: AppendTransitionInput): Promise<AppendTransitionResult> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.lead.updateMany({
        where: { id: input.leadId, currentState: input.expectedState },
        data: {
          currentState: input.toState,
          updatedAt: input.occurredAt,
          ...(input.closeReason ? { closeReason: input.closeReason } : {}),
        },
      });
      if (updated.count === 0) return { kind: 'conflict' };
      await tx.leadTransition.create({
        data: {
          id: input.transitionId,
          leadId: input.leadId,
          fromState: input.fromState,
          toState: input.toState,
          action: input.action,
          actor: input.actor,
          actorId: input.actorId,
          reason: input.reason,
          occurredAt: input.occurredAt,
        },
      });
      return { kind: 'applied' };
    });
  }

  async closeLeadsSystem(input: CloseLeadsSystemInput): Promise<number> {
    return this.closeWhere(
      { matchingResultId: input.matchingResultId, currentState: { in: ACTIVE_STATES } },
      input.reason,
      input.occurredAt,
    );
  }

  async closeSupersededLeadsForBrief(input: CloseSupersededLeadsInput): Promise<number> {
    return this.closeWhere(
      {
        briefId: input.briefId,
        matchingResultId: { not: input.currentMatchingResultId },
        currentState: { in: ACTIVE_STATES },
      },
      input.reason,
      input.occurredAt,
    );
  }

  /** Clôture transactionnelle en `perdu` (systeme) des leads ciblés + 1 transition/lead. */
  private async closeWhere(
    where: Prisma.LeadWhereInput,
    reason: string,
    occurredAt: Date,
  ): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const leads = await tx.lead.findMany({ where, select: { id: true, currentState: true } });
      for (const lead of leads) {
        await tx.lead.update({
          where: { id: lead.id },
          data: { currentState: 'perdu', closeReason: reason, updatedAt: occurredAt },
        });
        await tx.leadTransition.create({
          data: {
            leadId: lead.id,
            fromState: lead.currentState,
            toState: 'perdu',
            action: 'clore_systeme',
            actor: 'systeme',
            actorId: null,
            reason,
            occurredAt,
          },
        });
      }
      return leads.length;
    });
  }

  // ---------------------------------------------------------------- reader
  async findById(leadId: string): Promise<LeadWithHistory | null> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { transitions: { orderBy: { occurredAt: 'asc' } } },
    });
    if (!lead) return null;
    return toWithHistory(lead);
  }

  async listByConseiller(
    filter: ListLeadsByConseillerFilter,
  ): Promise<ListLeadsByConseillerResult> {
    const where: Prisma.LeadWhereInput = {
      conseillerId: filter.conseillerId,
      ...(filter.state ? { currentState: filter.state } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: { transitions: { orderBy: { occurredAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      prisma.lead.count({ where }),
    ]);
    return { items: rows.map(toWithHistory), total };
  }

  async findActiveByBriefAndConseiller(
    briefId: string,
    conseillerId: string,
  ): Promise<LeadRecord | null> {
    const lead = await prisma.lead.findFirst({
      where: { briefId, conseillerId, currentState: { in: ACTIVE_STATES } },
    });
    return lead ? toRecord(lead) : null;
  }

  async findActiveMatchingResultsWithoutLead(
    limit: number,
  ): Promise<ReadonlyArray<MatchingResultWithoutLead>> {
    const rows = await prisma.matchingResult.findMany({
      where: {
        supersededAt: null,
        status: { in: ['ok', 'partial'] },
        briefId: { not: null },
        leads: { none: {} },
      },
      select: { id: true, briefId: true },
      take: limit,
    });
    return rows
      .filter((r): r is { id: string; briefId: string } => r.briefId !== null)
      .map((r) => ({ matchingResultId: r.id, briefId: r.briefId }));
  }
}

// ---------------------------------------------------------------------------
// Mapping Prisma → domaine
// ---------------------------------------------------------------------------

type PrismaLead = Prisma.LeadGetPayload<Record<string, never>>;
type PrismaLeadWithTransitions = Prisma.LeadGetPayload<{ include: { transitions: true } }>;

function toRecord(l: PrismaLead): LeadRecord {
  return {
    id: l.id,
    matchingResultId: l.matchingResultId,
    matchingResultEntryPosition: l.matchingResultEntryPosition as 1 | 2 | 3,
    conseillerId: l.conseillerId,
    briefId: l.briefId,
    currentState: l.currentState,
    scoreFinal: l.scoreFinal === null ? null : Number(l.scoreFinal),
    boosted: l.boosted,
    closeReason: l.closeReason,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

function toWithHistory(l: PrismaLeadWithTransitions): LeadWithHistory {
  return {
    ...toRecord(l),
    history: l.transitions.map((t) => ({
      id: t.id,
      fromState: t.fromState,
      toState: t.toState,
      actor: t.actor,
      actorId: t.actorId,
      occurredAt: t.occurredAt,
    })),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
