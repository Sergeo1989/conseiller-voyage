// T077 [TDD GREEN] — DetectAllMatchesRevokedUseCase (FR-016 US3).
//
// Scan quotidien des MR actifs status='ok'. Pour chaque MR, vérifie le statut
// verified courant des 3 conseillers via ConformiteQueryPort. Si tous les 3
// sont révoqués, émet outbox `voyageur_brief_all_matches_revoked` +
// audit `matching.all_matches_revoked_detected`.
//
// Idempotence garantie par UNIQUE idempotency_key sur outbox
// (`matching:<briefId>:voyageur.brief.all_matches_revoked:<matchingResultId>`).

import type { ConformiteQueryPort, VerificationStatusDto } from '@cv/shared/conformite';
import type { MatchingAuditEntryId, MatchingOutboxEntryId } from '@cv/shared/matching';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { MatchingAuditWriter } from '../ports/matching-audit-writer.port';
import type { MatchingOutboxWriter } from '../ports/matching-outbox-writer.port';
import type {
  MatchingResultEntity,
  MatchingResultReader,
} from '../ports/matching-result-reader.port';

export interface DetectAllMatchesRevokedDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly reader: MatchingResultReader;
  readonly conformiteQuery: ConformiteQueryPort;
  readonly auditWriter: MatchingAuditWriter;
  readonly outboxWriter: MatchingOutboxWriter;
}

export interface DetectAllMatchesRevokedResult {
  readonly scannedCount: number;
  readonly revokedCount: number;
}

export class DetectAllMatchesRevokedUseCase {
  static readonly DEPS_TOKEN = Symbol.for('DetectAllMatchesRevokedDeps');

  constructor(private readonly deps: DetectAllMatchesRevokedDeps) {}

  async scan(input: { readonly batchSize: number }): Promise<DetectAllMatchesRevokedResult> {
    const mrs = await this.deps.reader.findActiveOkResultsForRevocationScan(input.batchSize);
    let revokedCount = 0;
    for (const mr of mrs) {
      if (mr.briefId === null) continue;
      const allRevoked = await this.checkAllRevoked(mr);
      if (allRevoked) {
        await this.publishRevokedSignals(mr);
        revokedCount += 1;
      }
    }
    return { scannedCount: mrs.length, revokedCount };
  }

  private async checkAllRevoked(mr: MatchingResultEntity): Promise<boolean> {
    const statuses = await Promise.all(
      mr.entries.map((e) =>
        this.deps.conformiteQuery.getVerificationStatus({ conseillerId: e.conseillerId }),
      ),
    );
    return statuses.every((s: VerificationStatusDto) => !s.verified);
  }

  private async publishRevokedSignals(mr: MatchingResultEntity): Promise<void> {
    if (mr.briefId === null) return;
    const briefId = mr.briefId;
    const now = this.deps.clock.now();
    const outboxId = this.deps.uuid.generate() as MatchingOutboxEntryId;
    const idempotencyKey = `matching:${briefId}:voyageur.brief.all_matches_revoked:${mr.id}`;

    const enqueueResult = await this.deps.outboxWriter.enqueue({
      id: outboxId,
      eventType: 'voyageur_brief_all_matches_revoked',
      idempotencyKey,
      payload: {
        matchingResultId: mr.id,
        briefId,
        algorithmVersion: mr.algorithmVersion,
        originalComputedAt: mr.computedAt.toISOString(),
        revokedAt: now.toISOString(),
        revokedConseillerIds: mr.entries.map((e) => e.conseillerId) as [string, string, string],
      },
    });

    // Idempotence : si déjà émis (UNIQUE idempotencyKey), pas d'audit dupliqué
    if (enqueueResult.kind === 'duplicate') return;

    await this.deps.auditWriter.append({
      id: this.deps.uuid.generate() as MatchingAuditEntryId,
      briefId,
      matchingResultId: mr.id,
      eventType: 'matching.all_matches_revoked_detected',
      payload: {
        revokedConseillerCount: 3,
      },
      idempotencyKey: null,
      correlationId: null,
      occurredAt: now,
    });
  }
}
