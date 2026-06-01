// T075 [TDD GREEN] — TriggerRematchUseCase (FR-016 US3, Q4 clarify).
//
// Re-matching admin manuel quand les 3 conseillers d'un MR sont révoqués.
// Verrou Redis empêche concurrent rematch sur le même briefId (TTL 30s).
// L'ancien MR est marqué supersededAt + supersededByMatchingResultId,
// audit `matching.recomputed` avec actor + reason.

import type { MatchingAuditEntryId, MatchingResultId } from '@cv/shared/matching';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { MatchingAuditWriter } from '../ports/matching-audit-writer.port';
import type { MatchingResultReader } from '../ports/matching-result-reader.port';
import type { MatchingResultWriter } from '../ports/matching-result-writer.port';
import type { RedisRematchLock } from '../ports/redis-rematch-lock.port';
import type { PerformMatchingUseCase } from './perform-matching.use-case';

const LOCK_TTL_MS = 30_000;

export interface TriggerRematchDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly performMatching: PerformMatchingUseCase;
  readonly resultReader: MatchingResultReader;
  readonly resultWriter: MatchingResultWriter;
  readonly auditWriter: MatchingAuditWriter;
  readonly lock: RedisRematchLock;
}

export interface TriggerRematchInput {
  readonly briefId: string;
  readonly adminUserId: string;
  readonly reason: string;
}

export type TriggerRematchResult =
  | {
      readonly kind: 'ok';
      readonly newMatchingResultId: MatchingResultId;
      readonly previousMatchingResultId: MatchingResultId;
      readonly status: 'ok' | 'partial' | 'empty';
      readonly matchedCount: 0 | 1 | 2 | 3;
    }
  | { readonly kind: 'brief_not_found' }
  | { readonly kind: 'no_previous_result' }
  | { readonly kind: 'lock_in_progress' };

export class TriggerRematchUseCase {
  static readonly DEPS_TOKEN = Symbol.for('TriggerRematchDeps');

  constructor(private readonly deps: TriggerRematchDeps) {}

  async execute(input: TriggerRematchInput): Promise<TriggerRematchResult> {
    // 1. Acquérir le verrou Redis — empêche concurrent rematch
    const lockResult = await this.deps.lock.acquire(input.briefId, LOCK_TTL_MS);
    if (lockResult.kind === 'already_held') {
      return { kind: 'lock_in_progress' };
    }

    try {
      // 2. Lire le MR actif (= celui à superseder)
      const previous = await this.deps.resultReader.findActiveByBriefId(input.briefId);
      if (!previous) return { kind: 'no_previous_result' };

      // 3. Mark superseded BEFORE creating new (libère le UNIQUE INDEX partiel)
      const supersededAt = this.deps.clock.now();
      const newMatchingResultId = this.deps.uuid.generate() as MatchingResultId;
      await this.deps.resultWriter.markSuperseded(previous.id, newMatchingResultId, supersededAt);

      // 4. Recompute via PerformMatchingUseCase (idempotence levée par
      //    le supersedeAt précédent)
      const result = await this.deps.performMatching.execute({ briefId: input.briefId });
      if (result.kind === 'brief_not_found') return { kind: 'brief_not_found' };
      if (result.kind === 'replay_ignored') {
        // Impossible normalement (markSuperseded a libéré le slot), mais
        // par sécurité on retourne le résultat précédent comme nouveau
        // (l'utilisateur sera confus mais aucun dommage causé).
        return {
          kind: 'ok',
          newMatchingResultId: previous.id,
          previousMatchingResultId: previous.id,
          status: previous.status,
          matchedCount: previous.matchedCount,
        };
      }

      // 5. Audit matching.recomputed
      await this.deps.auditWriter.append({
        id: this.deps.uuid.generate() as MatchingAuditEntryId,
        briefId: input.briefId,
        matchingResultId: result.matchingResultId,
        eventType: 'matching.recomputed',
        payload: {
          previousMatchingResultId: previous.id,
          adminActorId: input.adminUserId,
          reason: input.reason,
        },
        idempotencyKey: null,
        correlationId: null,
        occurredAt: this.deps.clock.now(),
      });

      return {
        kind: 'ok',
        newMatchingResultId: result.matchingResultId,
        previousMatchingResultId: previous.id,
        status: result.status,
        matchedCount: result.matchedCount,
      };
    } finally {
      // 6. Release le lock (best-effort — le TTL Redis le ferait sinon)
      await this.deps.lock.release(input.briefId);
    }
  }
}
