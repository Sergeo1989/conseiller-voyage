// T028 [US1] — PrismaLeadBriefSummaryReader.
// Résumé NON sensible du brief pour la notification (FR-004). Lit
// intake_voyageur_briefs (GRANT SELECT cross-module). `null` si anonymisé.

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type { LeadBriefSummaryDto } from '../application/ports';
import type { LeadBriefSummaryReader } from '../application/ports';

interface DestinationJson {
  country?: string;
  region?: string;
}

@Injectable()
export class PrismaLeadBriefSummaryReader implements LeadBriefSummaryReader {
  async getSummary(briefId: string): Promise<LeadBriefSummaryDto | null> {
    const brief = await prisma.voyageurBrief.findUnique({
      where: { id: briefId },
      select: { status: true, destinations: true, departureDate: true, speciality: true },
    });
    if (!brief || brief.status === 'anonymized') return null;

    return {
      destinations: parseDestinations(brief.destinations),
      periodeApprox: formatPeriode(brief.departureDate),
      typeProjet: brief.speciality,
    };
  }
}

function parseDestinations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((d) => {
      const dest = d as DestinationJson;
      if (!dest || typeof dest.country !== 'string') return null;
      return dest.region ? `${dest.country} (${dest.region})` : dest.country;
    })
    .filter((x): x is string => x !== null);
}

const PERIODE_FORMAT = new Intl.DateTimeFormat('fr-CA', { month: 'long', year: 'numeric' });

function formatPeriode(departureDate: Date): string {
  return PERIODE_FORMAT.format(departureDate);
}
