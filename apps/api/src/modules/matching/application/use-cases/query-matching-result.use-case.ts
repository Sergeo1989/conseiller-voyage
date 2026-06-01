// T073 [TDD GREEN] — QueryMatchingResultUseCase (US3 P3 FR-015).
//
// Implémente 2 méthodes consommées par MatchingQueryPort :
//   - getByBriefIdForVoyageur : filtre dynamique verified via ConformiteQueryPort
//   - getByBriefIdForAdmin : tout historique exact + currentVerifiedStatus
//
// Le MatchingResult original reste intact en DB (append-only Loi 25).
// Si briefId est NULL (anonymisation Loi 25 cascadée), retourne null pour
// les 2 méthodes — aucune fuite PII.

import type { ConformiteQueryPort, VerificationStatusDto } from '@cv/shared/conformite';
import type {
  ConseillerCurrentVerifiedStatus,
  MatchingResultAdminEntry,
  MatchingResultAdminView,
  MatchingResultPublicEntry,
  MatchingResultPublicView,
} from '@cv/shared/matching';
import type { MatchingResultReader } from '../ports/matching-result-reader.port';

export interface QueryMatchingResultDeps {
  readonly reader: MatchingResultReader;
  readonly conformiteQuery: ConformiteQueryPort;
}

export class QueryMatchingResultUseCase {
  static readonly DEPS_TOKEN = Symbol.for('QueryMatchingResultDeps');

  constructor(private readonly deps: QueryMatchingResultDeps) {}

  async getByBriefIdForVoyageur(briefId: string): Promise<MatchingResultPublicView | null> {
    const entity = await this.deps.reader.findActiveByBriefId(briefId);
    if (!entity || entity.briefId === null) return null;

    // Filtre dynamique verified (FR-015) — exclut les conseillers révoqués
    // après le calcul. Le MR original reste intact en DB.
    const statuses = await this.batchVerify(entity.entries.map((e) => e.conseillerId));
    const filtered: MatchingResultPublicEntry[] = entity.entries
      .filter((e) => statuses.get(e.conseillerId)?.verified === true)
      .map((e) => ({
        position: e.position,
        conseillerId: e.conseillerId,
      }));

    return {
      matchingResultId: entity.id,
      briefId: entity.briefId,
      status: entity.status,
      matchedCount: filtered.length as 0 | 1 | 2 | 3,
      entries: filtered,
      computedAt: entity.computedAt,
      algorithmVersion: entity.algorithmVersion,
    };
  }

  async getByBriefIdForAdmin(briefId: string): Promise<MatchingResultAdminView | null> {
    const entity = await this.deps.reader.findActiveByBriefId(briefId);
    if (!entity || entity.briefId === null) return null;

    const statuses = await this.batchVerify(entity.entries.map((e) => e.conseillerId));
    const enrichedEntries: MatchingResultAdminEntry[] = entity.entries.map((e) => ({
      position: e.position,
      conseillerId: e.conseillerId,
      scoreBrut: e.scoreBrut,
      scoreFinal: e.scoreFinal,
      scoreComponents: e.scoreComponents,
      boosted: e.boosted,
      currentVerifiedStatus: toCurrentStatus(statuses.get(e.conseillerId)),
    }));

    return {
      matchingResultId: entity.id,
      briefId: entity.briefId,
      status: entity.status,
      matchedCount: entity.matchedCount,
      entries: enrichedEntries,
      computedAt: entity.computedAt,
      algorithmVersion: entity.algorithmVersion,
      supersededAt: entity.supersededAt,
      supersededByMatchingResultId: entity.supersededByMatchingResultId,
      boostApplied: entity.boostApplied,
      suggestedConseillerId: entity.suggestedConseillerId,
    };
  }

  private async batchVerify(
    conseillerIds: ReadonlyArray<string>,
  ): Promise<Map<string, VerificationStatusDto>> {
    const out = new Map<string, VerificationStatusDto>();
    for (const id of conseillerIds) {
      const status = await this.deps.conformiteQuery.getVerificationStatus({ conseillerId: id });
      out.set(id, status);
    }
    return out;
  }
}

function toCurrentStatus(
  status: VerificationStatusDto | undefined,
): ConseillerCurrentVerifiedStatus {
  if (!status) return 'unknown';
  return status.verified ? 'verified' : 'revoked';
}
