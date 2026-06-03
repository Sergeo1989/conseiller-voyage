// T072 [TDD RED] — Tests QueryMatchingResultUseCase (FR-015 US3).
//
// Le port `MatchingQueryPort` (public, consommé par 012/015 + admin US5
// de 008) expose 2 vues distinctes :
//   - getByBriefIdForVoyageur : filtre dynamique verified (exclut les
//     conseillers révoqués après calcul)
//   - getByBriefIdForAdmin : tout l'historique exact + currentVerifiedStatus
//
// Le use case implémente ces 2 méthodes en consommant ConformiteQueryPort
// pour le filtre dynamique.

import type { VerificationStatusDto } from '@cv/shared/conformite';
import type { ConformiteQueryPort } from '@cv/shared/conformite';
import { describe, expect, it } from 'vitest';
import type { FakeMatchingResultReader } from '../../__tests__/_fakes';
import type { MatchingResultEntity } from '../../ports/matching-result-reader.port';
import { QueryMatchingResultUseCase } from '../query-matching-result.use-case';

const BRIEF_ID = '11111111-1111-4111-8111-111111111111';
const MR_ID = '33333333-3333-4333-8333-333333333333';
const CA = '22222222-2222-4222-8222-000000000001';
const CB = '22222222-2222-4222-8222-000000000002';
const CC = '22222222-2222-4222-8222-000000000003';

function makeMR(): MatchingResultEntity {
  return {
    id: MR_ID as never,
    briefId: BRIEF_ID,
    status: 'ok',
    matchedCount: 3,
    algorithmVersion: 'v1.0',
    suggestedConseillerId: null,
    boostApplied: false,
    computedAt: new Date('2026-05-31T12:00:00Z'),
    supersededAt: null,
    supersededByMatchingResultId: null,
    entries: [
      {
        position: 1,
        conseillerId: CA,
        scoreBrut: 0.9,
        scoreFinal: 0.9,
        scoreComponents: { destination: 1, geo: 0.8, speciality: 1, familiarity: 1 },
        boosted: false,
      },
      {
        position: 2,
        conseillerId: CB,
        scoreBrut: 0.8,
        scoreFinal: 0.8,
        scoreComponents: { destination: 1, geo: 0.8, speciality: 1, familiarity: 0.5 },
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

function makeReaderWith(entity: MatchingResultEntity | null) {
  return {
    async findActiveByBriefId() {
      return entity;
    },
    async findActiveOkResultsForRevocationScan() {
      return [];
    },
  } satisfies Awaited<
    ReturnType<typeof FakeMatchingResultReader.prototype.findActiveByBriefId>
  > extends never
    ? never
    : {
        findActiveByBriefId: () => Promise<MatchingResultEntity | null>;
        findActiveOkResultsForRevocationScan: () => Promise<ReadonlyArray<MatchingResultEntity>>;
      };
}

class FakeConformiteQuery implements ConformiteQueryPort {
  private statuses = new Map<string, VerificationStatusDto>();
  setVerified(conseillerId: string, verified: boolean): void {
    this.statuses.set(conseillerId, {
      conseillerId,
      verified,
      lastVerifiedAt: verified ? new Date().toISOString() : null,
    });
  }
  async getVerificationStatus(args: {
    readonly conseillerId: string;
    readonly strict?: boolean;
  }): Promise<VerificationStatusDto> {
    return (
      this.statuses.get(args.conseillerId) ?? {
        conseillerId: args.conseillerId,
        verified: false,
        lastVerifiedAt: null,
      }
    );
  }
  onStatusChanged(): () => void {
    return () => {};
  }
}

function buildUseCase(entity: MatchingResultEntity | null) {
  const reader = makeReaderWith(entity);
  const conformite = new FakeConformiteQuery();
  return {
    useCase: new QueryMatchingResultUseCase({ reader, conformiteQuery: conformite }),
    conformite,
  };
}

describe('QueryMatchingResultUseCase', () => {
  it('voyageur : tous verified → top 3 complet retourné', async () => {
    const { useCase, conformite } = buildUseCase(makeMR());
    conformite.setVerified(CA, true);
    conformite.setVerified(CB, true);
    conformite.setVerified(CC, true);

    const view = await useCase.getByBriefIdForVoyageur(BRIEF_ID);
    expect(view?.matchedCount).toBe(3);
    expect(view?.entries.map((e) => e.conseillerId)).toEqual([CA, CB, CC]);
  });

  it('voyageur : 1 conseiller révoqué (B) → filtré dynamiquement, 2 retournés', async () => {
    const { useCase, conformite } = buildUseCase(makeMR());
    conformite.setVerified(CA, true);
    conformite.setVerified(CB, false); // révoqué
    conformite.setVerified(CC, true);

    const view = await useCase.getByBriefIdForVoyageur(BRIEF_ID);
    expect(view?.entries).toHaveLength(2);
    expect(view?.entries.map((e) => e.conseillerId)).toEqual([CA, CC]);
  });

  it('voyageur : tous révoqués → entries vide', async () => {
    const { useCase, conformite } = buildUseCase(makeMR());
    conformite.setVerified(CA, false);
    conformite.setVerified(CB, false);
    conformite.setVerified(CC, false);

    const view = await useCase.getByBriefIdForVoyageur(BRIEF_ID);
    expect(view?.entries).toHaveLength(0);
  });

  it('voyageur : brief inconnu → null', async () => {
    const { useCase } = buildUseCase(null);
    expect(await useCase.getByBriefIdForVoyageur(BRIEF_ID)).toBeNull();
  });

  it('voyageur : MR anonymisé (briefId NULL) → null', async () => {
    const mr = makeMR();
    const anonymised = { ...mr, briefId: null };
    const { useCase } = buildUseCase(anonymised);
    expect(await useCase.getByBriefIdForVoyageur(BRIEF_ID)).toBeNull();
  });

  it('admin : 1 révoqué → tous retournés + currentVerifiedStatus annoté', async () => {
    const { useCase, conformite } = buildUseCase(makeMR());
    conformite.setVerified(CA, true);
    conformite.setVerified(CB, false);
    conformite.setVerified(CC, true);

    const view = await useCase.getByBriefIdForAdmin(BRIEF_ID);
    expect(view?.entries).toHaveLength(3);
    expect(view?.entries[0]?.currentVerifiedStatus).toBe('verified');
    expect(view?.entries[1]?.currentVerifiedStatus).toBe('revoked');
    expect(view?.entries[2]?.currentVerifiedStatus).toBe('verified');
    // scoreComponents complets exposés à l'admin (pas au voyageur)
    expect(view?.entries[0]?.scoreComponents.destination).toBe(1);
  });
});
