import type {
  MatchingAuditEntryId,
  MatchingOutboxEntryId,
  MatchingResultId,
} from '@cv/shared/matching';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import { applyBoost } from '../../domain/services/apply-boost';
import { calculateScore } from '../../domain/services/calculate-score';
import { type ScoredConseiller, selectTopThree } from '../../domain/services/select-top-three';
import type { MatchingStatus } from '../../domain/value-objects/matching-status.vo';
import type { WeightsConfig } from '../../domain/value-objects/weights-config.vo';
import type { BriefSnapshotReader } from '../ports/brief-snapshot-reader.port';
import type { ConseillerSnapshotReader } from '../ports/conseiller-snapshot-reader.port';
import type { FsaCentroidReader } from '../ports/fsa-centroid-reader.port';
import type {
  MatchingAuditEventType,
  MatchingAuditPayload,
  MatchingAuditWriter,
} from '../ports/matching-audit-writer.port';
import type {
  MatchingOutboxEntryInput,
  MatchingOutboxWriter,
} from '../ports/matching-outbox-writer.port';
import type { MatchingResultWriter } from '../ports/matching-result-writer.port';

export interface PerformMatchingDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly briefReader: BriefSnapshotReader;
  readonly conseillerReader: ConseillerSnapshotReader;
  readonly fsaReader: FsaCentroidReader;
  readonly resultWriter: MatchingResultWriter;
  readonly auditWriter: MatchingAuditWriter;
  readonly outboxWriter: MatchingOutboxWriter;
  readonly weights: WeightsConfig;
  readonly algorithmVersion: string;
  /** Plafond facteur boost (FR-011 ≤ 1.10). Optionnel — défaut 1.10. */
  readonly boostFactorMax?: number;
}

export type PerformMatchingResult =
  | {
      readonly kind: 'ok';
      readonly matchingResultId: MatchingResultId;
      readonly status: MatchingStatus;
      readonly matchedCount: 0 | 1 | 2 | 3;
    }
  | { readonly kind: 'replay_ignored' }
  | { readonly kind: 'brief_not_found' };

export class PerformMatchingUseCase {
  static readonly DEPS_TOKEN = Symbol.for('PerformMatchingDeps');

  constructor(private readonly deps: PerformMatchingDeps) {}

  async execute(input: { readonly briefId: string }): Promise<PerformMatchingResult> {
    const brief = await this.deps.briefReader.readByBriefId(input.briefId);
    if (!brief) return { kind: 'brief_not_found' };

    const startMs = this.deps.clock.nowMs();
    const candidates = await this.deps.conseillerReader.readAllVerifiedSnapshots(
      brief.conseillerLanguage,
    );

    // FR-009c : exclure les conseillers sans FSA + audit dédié pour chacun
    const eligible = candidates.filter((c) => c.fsa !== null);
    const addressMissing = candidates.filter((c) => c.fsa === null);
    for (const c of addressMissing) {
      await this.auditAddressMissing(c.conseillerId);
    }

    // Score chaque candidat éligible (fonction pure) + applique le boost
    // cookie cv_suggested (US2 — FR-011/FR-012). Le boost ne s'applique
    // qu'aux conseillers éligibles (déjà filtrés verified + langue + FSA).
    const fsaCentroids = this.deps.fsaReader.getAll();
    const factorMax = this.deps.boostFactorMax ?? 1.1;
    const scored: ScoredConseiller[] = eligible.map((c) => {
      const components = calculateScore(brief, c, fsaCentroids);
      const scoreBrut = components.toScoreBrut(this.deps.weights);
      const { scoreFinal, boosted } = applyBoost({
        scoreBrut,
        conseillerId: c.conseillerId,
        suggestedConseillerId: brief.suggestedConseillerId,
        factorMax,
      });
      return {
        conseillerId: c.conseillerId,
        scoreBrut,
        scoreFinal,
        components: {
          destination: components.destination,
          geo: components.geo,
          speciality: components.speciality,
          familiarity: components.familiarity,
        },
        boosted,
      };
    });

    const topThree = selectTopThree(scored);
    const computedAt = this.deps.clock.now();
    const matchingResultId = this.deps.uuid.generate() as MatchingResultId;

    // boostApplied = true si au moins une entrée du top 3 a effectivement
    // bénéficié du boost. Faux si suggestedConseillerId pointe vers un
    // conseiller non-éligible (filtré en amont) ou hors top 3.
    const boostApplied = topThree.entries.some((e) => e.boosted);

    // Persist (idempotence via UNIQUE INDEX partiel)
    const writeResult = await this.deps.resultWriter.create(
      {
        id: matchingResultId,
        briefId: brief.briefId,
        status: topThree.status,
        matchedCount: topThree.matchedCount,
        algorithmVersion: this.deps.algorithmVersion,
        suggestedConseillerId: brief.suggestedConseillerId,
        boostApplied,
        computedAt,
      },
      topThree.entries.map((e) => ({
        position: e.position,
        conseillerId: e.conseillerId,
        scoreBrut: e.scoreBrut.value,
        scoreFinal: e.scoreFinal.value,
        scoreComponents: e.components,
        boosted: e.boosted,
      })),
    );

    if (writeResult.kind === 'already_exists') {
      await this.auditReplayIgnored(brief.briefId);
      return { kind: 'replay_ignored' };
    }

    const durationMs = this.deps.clock.nowMs() - startMs;
    await this.auditComputed(
      brief.briefId,
      matchingResultId,
      topThree.status,
      candidates.length,
      eligible.length,
      durationMs,
      boostApplied,
    );
    await this.publishOutboxEvent(brief, matchingResultId, topThree, computedAt, boostApplied);

    return {
      kind: 'ok',
      matchingResultId,
      status: topThree.status,
      matchedCount: topThree.matchedCount,
    };
  }

  private async auditAddressMissing(conseillerId: string): Promise<void> {
    await this.deps.auditWriter.append({
      id: this.deps.uuid.generate() as MatchingAuditEntryId,
      briefId: null,
      matchingResultId: null,
      eventType: 'matching.conseiller_address_missing',
      payload: { conseillerIdMissingAddress: conseillerId },
      idempotencyKey: null,
      correlationId: null,
      occurredAt: this.deps.clock.now(),
    });
  }

  private async auditReplayIgnored(briefId: string): Promise<void> {
    await this.deps.auditWriter.append({
      id: this.deps.uuid.generate() as MatchingAuditEntryId,
      briefId,
      matchingResultId: null,
      eventType: 'matching.replay_ignored',
      payload: { algorithmVersion: this.deps.algorithmVersion },
      idempotencyKey: null,
      correlationId: null,
      occurredAt: this.deps.clock.now(),
    });
  }

  private async auditComputed(
    briefId: string,
    matchingResultId: MatchingResultId,
    status: MatchingStatus,
    candidatesCount: number,
    verifiedCount: number,
    durationMs: number,
    boostApplied: boolean,
  ): Promise<void> {
    const eventType: MatchingAuditEventType =
      status === 'ok'
        ? 'matching.computed'
        : status === 'partial'
          ? 'matching.partial'
          : 'matching.empty';
    const payload: MatchingAuditPayload = {
      candidatesCount,
      verifiedCount,
      durationMs,
      algorithmVersion: this.deps.algorithmVersion,
      boostApplied,
    };
    await this.deps.auditWriter.append({
      id: this.deps.uuid.generate() as MatchingAuditEntryId,
      briefId,
      matchingResultId,
      eventType,
      payload,
      idempotencyKey: null,
      correlationId: null,
      occurredAt: this.deps.clock.now(),
    });
  }

  private async publishOutboxEvent(
    brief: Awaited<ReturnType<BriefSnapshotReader['readByBriefId']>>,
    matchingResultId: MatchingResultId,
    topThree: ReturnType<typeof selectTopThree>,
    computedAt: Date,
    boostApplied: boolean,
  ): Promise<void> {
    if (!brief) return;
    const outboxId = this.deps.uuid.generate() as MatchingOutboxEntryId;
    const idempotencyKey = `matching:${brief.briefId}:${topThree.status}:${this.deps.algorithmVersion}`;
    const commonEntries = topThree.entries.map((e) => ({
      position: e.position as 1 | 2 | 3,
      conseillerId: e.conseillerId,
      scoreFinal: e.scoreFinal.value,
      boosted: e.boosted,
    }));

    let entry: MatchingOutboxEntryInput;
    if (topThree.status === 'ok') {
      entry = {
        id: outboxId,
        eventType: 'voyageur_brief_matched',
        idempotencyKey,
        payload: {
          matchingResultId,
          briefId: brief.briefId,
          matchedCount: 3,
          algorithmVersion: this.deps.algorithmVersion,
          computedAt: computedAt.toISOString(),
          entries: commonEntries as Array<{
            position: 1 | 2 | 3;
            conseillerId: string;
            scoreFinal: number;
            boosted: boolean;
          }>,
          boostApplied,
        },
      };
    } else if (topThree.status === 'partial') {
      entry = {
        id: outboxId,
        eventType: 'voyageur_brief_partially_matched',
        idempotencyKey,
        payload: {
          matchingResultId,
          briefId: brief.briefId,
          matchedCount: topThree.matchedCount as 1 | 2,
          algorithmVersion: this.deps.algorithmVersion,
          computedAt: computedAt.toISOString(),
          entries: commonEntries as Array<{
            position: 1 | 2;
            conseillerId: string;
            scoreFinal: number;
            boosted: boolean;
          }>,
          boostApplied,
          reason: 'insufficient_verified_conseillers',
        },
      };
    } else {
      entry = {
        id: outboxId,
        eventType: 'voyageur_brief_unmatched',
        idempotencyKey,
        payload: {
          matchingResultId,
          briefId: brief.briefId,
          matchedCount: 0,
          algorithmVersion: this.deps.algorithmVersion,
          computedAt: computedAt.toISOString(),
          reason: 'no_verified_conseillers_at_all',
          candidatesEvaluatedCount: 0,
        },
      };
    }

    await this.deps.outboxWriter.enqueue(entry);
  }
}
