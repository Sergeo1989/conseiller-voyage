// T076 [TDD RED] — Tests DetectAllMatchesRevokedUseCase (FR-016).
//
// Scan quotidien des MR actifs status='ok'. Pour chaque MR, vérifie le statut
// verified courant des 3 conseillers. Si tous les 3 sont révoqués → émet
// outbox `voyageur_brief_all_matches_revoked` (idempotent via UNIQUE
// idempotency_key).

import type { ConformiteQueryPort, VerificationStatusDto } from '@cv/shared/conformite';
import { describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeMatchingAuditWriter,
  FakeMatchingOutboxWriter,
  FakeUuidGenerator,
} from '../../__tests__/_fakes';
import type { MatchingResultEntity } from '../../ports/matching-result-reader.port';
import { DetectAllMatchesRevokedUseCase } from '../detect-all-matches-revoked.use-case';

const CA = '22222222-2222-4222-8222-000000000001';
const CB = '22222222-2222-4222-8222-000000000002';
const CC = '22222222-2222-4222-8222-000000000003';
const NOW = new Date('2026-05-31T12:00:00.000Z');

function makeMR(idSuffix: string, briefIdSuffix: string): MatchingResultEntity {
  return {
    id: `33333333-3333-4333-8333-${idSuffix.padStart(12, '0')}` as never,
    briefId: `11111111-1111-4111-8111-${briefIdSuffix.padStart(12, '0')}`,
    status: 'ok',
    matchedCount: 3,
    algorithmVersion: 'v1.0',
    suggestedConseillerId: null,
    boostApplied: false,
    computedAt: NOW,
    supersededAt: null,
    supersededByMatchingResultId: null,
    entries: [
      {
        position: 1,
        conseillerId: CA,
        scoreBrut: 0.9,
        scoreFinal: 0.9,
        scoreComponents: { destination: 1, geo: 1, speciality: 1, familiarity: 1 },
        boosted: false,
      },
      {
        position: 2,
        conseillerId: CB,
        scoreBrut: 0.8,
        scoreFinal: 0.8,
        scoreComponents: { destination: 1, geo: 1, speciality: 1, familiarity: 0.5 },
        boosted: false,
      },
      {
        position: 3,
        conseillerId: CC,
        scoreBrut: 0.7,
        scoreFinal: 0.7,
        scoreComponents: { destination: 1, geo: 0.5, speciality: 1, familiarity: 0.5 },
        boosted: false,
      },
    ],
  };
}

class FakeReader {
  private store: MatchingResultEntity[] = [];
  add(mr: MatchingResultEntity): void {
    this.store.push(mr);
  }
  async findActiveByBriefId(): Promise<null> {
    return null;
  }
  async findActiveOkResultsForRevocationScan(
    limit: number,
  ): Promise<ReadonlyArray<MatchingResultEntity>> {
    return this.store.slice(0, limit);
  }
}

class FakeConformiteQuery implements ConformiteQueryPort {
  private statuses = new Map<string, boolean>();
  setVerified(conseillerId: string, verified: boolean): void {
    this.statuses.set(conseillerId, verified);
  }
  async getVerificationStatus(args: {
    readonly conseillerId: string;
  }): Promise<VerificationStatusDto> {
    return {
      conseillerId: args.conseillerId,
      verified: this.statuses.get(args.conseillerId) ?? false,
      lastVerifiedAt: null,
    };
  }
  onStatusChanged(): () => void {
    return () => {};
  }
}

function buildUseCase() {
  const reader = new FakeReader();
  const conformite = new FakeConformiteQuery();
  const audit = new FakeMatchingAuditWriter();
  const outbox = new FakeMatchingOutboxWriter();
  const useCase = new DetectAllMatchesRevokedUseCase({
    clock: new FakeClock(NOW),
    uuid: new FakeUuidGenerator(),
    reader,
    conformiteQuery: conformite,
    auditWriter: audit,
    outboxWriter: outbox,
  });
  return { useCase, reader, conformite, audit, outbox };
}

describe('DetectAllMatchesRevokedUseCase', () => {
  it('3/3 révoqués → outbox all_matches_revoked + audit', async () => {
    const env = buildUseCase();
    env.reader.add(makeMR('001', '001'));
    env.conformite.setVerified(CA, false);
    env.conformite.setVerified(CB, false);
    env.conformite.setVerified(CC, false);

    const result = await env.useCase.scan({ batchSize: 100 });

    expect(result.scannedCount).toBe(1);
    expect(result.revokedCount).toBe(1);
    expect(env.outbox.countByEventType('voyageur_brief_all_matches_revoked')).toBe(1);
    expect(env.audit.countByEventType('matching.all_matches_revoked_detected')).toBe(1);
  });

  it('2/3 révoqués (1 verified) → no-op (pas all_matches)', async () => {
    const env = buildUseCase();
    env.reader.add(makeMR('001', '001'));
    env.conformite.setVerified(CA, true); // verified
    env.conformite.setVerified(CB, false);
    env.conformite.setVerified(CC, false);

    const result = await env.useCase.scan({ batchSize: 100 });

    expect(result.revokedCount).toBe(0);
    expect(env.outbox.entries).toHaveLength(0);
  });

  it('0/3 révoqués (tous verified) → no-op', async () => {
    const env = buildUseCase();
    env.reader.add(makeMR('001', '001'));
    env.conformite.setVerified(CA, true);
    env.conformite.setVerified(CB, true);
    env.conformite.setVerified(CC, true);

    const result = await env.useCase.scan({ batchSize: 100 });

    expect(result.revokedCount).toBe(0);
    expect(env.outbox.entries).toHaveLength(0);
  });

  it('idempotence : 2 scans consécutifs sur même MR → 1 seul event outbox (UNIQUE idempotency)', async () => {
    const env = buildUseCase();
    env.reader.add(makeMR('001', '001'));
    env.conformite.setVerified(CA, false);
    env.conformite.setVerified(CB, false);
    env.conformite.setVerified(CC, false);

    await env.useCase.scan({ batchSize: 100 });
    await env.useCase.scan({ batchSize: 100 });

    expect(env.outbox.countByEventType('voyageur_brief_all_matches_revoked')).toBe(1);
  });

  it('batch : 5 MR scannés en batchSize=3 → 3 processés', async () => {
    const env = buildUseCase();
    for (let i = 1; i <= 5; i += 1) {
      env.reader.add(makeMR(String(i), String(i)));
    }
    const result = await env.useCase.scan({ batchSize: 3 });
    expect(result.scannedCount).toBe(3);
  });
});
