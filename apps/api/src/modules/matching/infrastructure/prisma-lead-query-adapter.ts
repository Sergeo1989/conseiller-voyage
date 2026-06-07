// T049 [US3] — PrismaLeadQueryAdapter : implémente le port public
// `MatchingLeadQueryPort` (@cv/shared/matching), consommé par 014 (dashboard)
// et 015 (espace voyageur). Lecture PURE — aucune transition déclenchée.
//
// Filtrage dynamique verified (ConformiteQueryPort) sur la vue voyageur.
// Loi 25 : retourne null pour un brief anonymisé (briefId nullé en cascade).

import { type Prisma, prisma } from '@cv/db';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import {
  type BriefLeadsSummaryView,
  type LeadAdminListView,
  type LeadDetailView,
  type ListLeadsForConseillerFilter,
  type MatchingLeadQueryPort,
  asMatchingResultId,
} from '@cv/shared/matching';
import { Inject, Injectable } from '@nestjs/common';

type LeadWithTransitions = Prisma.LeadGetPayload<{ include: { transitions: true } }>;

@Injectable()
export class PrismaLeadQueryAdapter implements MatchingLeadQueryPort {
  constructor(
    @Inject(CONFORMITE_QUERY_PORT) private readonly conformiteQuery: ConformiteQueryPort,
  ) {}

  async listLeadsForConseiller(
    conseillerId: string,
    filter: ListLeadsForConseillerFilter,
  ): Promise<LeadAdminListView> {
    const where: Prisma.LeadWhereInput = {
      conseillerId,
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
    return {
      items: rows.map(toDetailView),
      page: filter.page,
      pageSize: filter.pageSize,
      total,
    };
  }

  async getLeadById(leadId: string): Promise<LeadDetailView | null> {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { transitions: { orderBy: { occurredAt: 'asc' } } },
    });
    return lead ? toDetailView(lead) : null;
  }

  async getBriefLeadsSummary(briefId: string): Promise<BriefLeadsSummaryView | null> {
    const leads = await prisma.lead.findMany({
      where: { briefId },
      orderBy: { matchingResultEntryPosition: 'asc' },
      select: { matchingResultEntryPosition: true, currentState: true, conseillerId: true },
    });
    // Aucun lead pour ce brief (jamais matché OU anonymisé Loi 25 → briefId nullé).
    if (leads.length === 0) return null;

    const summary = await Promise.all(
      leads.map(async (l) => {
        const status = await this.conformiteQuery.getVerificationStatus({
          conseillerId: l.conseillerId,
        });
        return {
          position: l.matchingResultEntryPosition as 1 | 2 | 3,
          currentState: l.currentState,
          conseillerVerifie: status.verified,
        };
      }),
    );
    return { briefId, leads: summary };
  }
}

function toDetailView(lead: LeadWithTransitions): LeadDetailView {
  return {
    id: lead.id,
    matchingResultId: asMatchingResultId(lead.matchingResultId),
    position: lead.matchingResultEntryPosition as 1 | 2 | 3,
    conseillerId: lead.conseillerId,
    briefId: lead.briefId,
    currentState: lead.currentState,
    scoreFinal: lead.scoreFinal === null ? null : Number(lead.scoreFinal),
    boosted: lead.boosted,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    history: lead.transitions.map((t) => ({
      fromState: t.fromState,
      toState: t.toState,
      actor: t.actor,
      occurredAt: t.occurredAt,
    })),
  };
}
