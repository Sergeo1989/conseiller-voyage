// T079 — Adapter Prisma : MatchingQueryPort (public — consommé par 012/015 +
// admin US5 extension de 008).
//
// Implémente l'interface publique exportée depuis @cv/shared/matching. Délègue
// à QueryMatchingResultUseCase pour la logique (filtre dynamique verified
// via ConformiteQueryPort).

import type {
  BriefRevocationSummary,
  MatchingQueryPort,
  MatchingResultAdminView,
  MatchingResultPublicView,
} from '@cv/shared/matching';
import { Inject, Injectable } from '@nestjs/common';
import { QueryMatchingResultUseCase } from '../application/use-cases/query-matching-result.use-case';

@Injectable()
export class PrismaMatchingQueryAdapter implements MatchingQueryPort {
  constructor(
    @Inject(QueryMatchingResultUseCase)
    private readonly queryUseCase: QueryMatchingResultUseCase,
  ) {}

  async getByBriefIdForVoyageur(briefId: string): Promise<MatchingResultPublicView | null> {
    return this.queryUseCase.getByBriefIdForVoyageur(briefId);
  }

  async getByBriefIdForAdmin(briefId: string): Promise<MatchingResultAdminView | null> {
    return this.queryUseCase.getByBriefIdForAdmin(briefId);
  }

  async listBriefsWithAllMatchesRevoked(
    _sinceMs: number,
  ): Promise<ReadonlyArray<BriefRevocationSummary>> {
    // MVP : retourne [] (les briefs all_matches_revoked sont signalés via
    // outbox event, consommé par admin US5 file 008). Une vue agrégée admin
    // dédiée serait ajoutée en Phase 6 polish si l'admin le demande.
    return [];
  }
}
