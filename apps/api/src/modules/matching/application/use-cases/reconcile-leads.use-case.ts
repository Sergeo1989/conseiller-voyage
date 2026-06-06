// T046 [TDD GREEN] — ReconcileLeadsUseCase (US3, mode dégradé bus HS).
//
// Le pub/sub `matching.events` est lossy (ADR-0026). Ce sweep scanne les
// MatchingResults actifs (`ok`/`partial`) SANS lead correspondant et rejoue la
// création des leads + notifications. Idempotent via les contraintes UNIQUE DB
// (réutilise `ConsumeMatchingEventUseCase.replayMatchingResult`).

import type { LeadReader } from '../ports';
import type { MatchingResultReader } from '../ports/matching-result-reader.port';
import type { ConsumeMatchingEventUseCase } from './consume-matching-event.use-case';

export interface ReconcileLeadsDeps {
  readonly leadReader: LeadReader;
  readonly matchingResultReader: MatchingResultReader;
  readonly consume: ConsumeMatchingEventUseCase;
}

export interface ReconcileLeadsResult {
  readonly scanned: number;
  readonly recreated: number;
}

export class ReconcileLeadsUseCase {
  static readonly DEPS_TOKEN = Symbol.for('ReconcileLeadsDeps');

  constructor(private readonly deps: ReconcileLeadsDeps) {}

  async execute(input: { limit: number }): Promise<ReconcileLeadsResult> {
    const orphans = await this.deps.leadReader.findActiveMatchingResultsWithoutLead(input.limit);
    let recreated = 0;

    for (const orphan of orphans) {
      const mr = await this.deps.matchingResultReader.findActiveByBriefId(orphan.briefId);
      // Seul le MR actif courant (non superseded, non anonymisé) est rejoué.
      if (!mr || mr.id !== orphan.matchingResultId || mr.briefId === null) continue;
      if (mr.entries.length === 0) continue;

      const res = await this.deps.consume.replayMatchingResult({
        matchingResultId: mr.id,
        briefId: mr.briefId,
        entries: mr.entries.map((e) => ({
          position: e.position,
          conseillerId: e.conseillerId,
          scoreFinal: e.scoreFinal,
          boosted: e.boosted,
        })),
      });
      recreated += res.leadsCreated;
    }

    return { scanned: orphans.length, recreated };
  }
}
