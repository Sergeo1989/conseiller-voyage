// T074 [TDD RED] — Tests TriggerRematchUseCase (FR-016 US3, Q4 clarify).
//
// Re-matching admin manuel quand les 3 conseillers d'un MR sont révoqués.
// Verrou Redis (SETNX EX 30s) empêche concurrent rematch sur le même briefId.
// L'ancien MR est supersededAt + supersededByMatchingResultId chaîné.
// Audit `matching.recomputed` avec actor + reason.

import { describe, expect, it } from 'vitest';
import { asFsaCode } from '../../../domain/value-objects/fsa-code.vo';
import { WeightsConfig } from '../../../domain/value-objects/weights-config.vo';
import {
  FakeBriefSnapshotReader,
  FakeClock,
  FakeConseillerSnapshotReader,
  FakeFsaCentroidReader,
  FakeMatchingAuditWriter,
  FakeMatchingOutboxWriter,
  FakeMatchingResultReader,
  FakeMatchingResultWriter,
  FakeRedisRematchLock,
  FakeUuidGenerator,
} from '../../__tests__/_fakes';
import { PerformMatchingUseCase } from '../perform-matching.use-case';
import { TriggerRematchUseCase } from '../trigger-rematch.use-case';

const BRIEF_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '88888888-8888-4888-8888-888888888888';
const NOW = new Date('2026-05-31T12:00:00.000Z');

function buildEnv() {
  const briefReader = new FakeBriefSnapshotReader();
  const conseillerReader = new FakeConseillerSnapshotReader();
  const fsaReader = new FakeFsaCentroidReader(
    new Map([
      [asFsaCode('H7N'), { lat: 45.5736, lng: -73.7239, province: 'QC' as const }],
      [asFsaCode('H2X'), { lat: 45.5125, lng: -73.5658, province: 'QC' as const }],
    ]),
  );
  const resultWriter = new FakeMatchingResultWriter();
  const resultReader = new FakeMatchingResultReader(resultWriter);
  const auditWriter = new FakeMatchingAuditWriter();
  const outboxWriter = new FakeMatchingOutboxWriter();
  const lock = new FakeRedisRematchLock();
  const clock = new FakeClock(NOW);
  const uuid = new FakeUuidGenerator();
  const performMatching = new PerformMatchingUseCase({
    clock,
    uuid,
    briefReader,
    conseillerReader,
    fsaReader,
    resultWriter,
    auditWriter,
    outboxWriter,
    weights: WeightsConfig.DEFAULT_WEIGHTS_V1,
    algorithmVersion: 'v1.0',
  });
  const useCase = new TriggerRematchUseCase({
    clock,
    uuid,
    performMatching,
    resultReader,
    resultWriter,
    auditWriter,
    lock,
  });
  return {
    useCase,
    briefReader,
    conseillerReader,
    resultWriter,
    resultReader,
    auditWriter,
    lock,
    performMatching,
  };
}

function makeBrief(overrides = {}) {
  return {
    briefId: BRIEF_ID,
    destinations: [{ country: 'CU' as const }],
    conseillerLanguage: 'fr' as const,
    speciality: 'lune_de_miel' as const,
    familiarity: 'experienced_traveler' as const,
    voyageurFsa: asFsaCode('H7N'),
    suggestedConseillerId: null,
    ...overrides,
  };
}

function makeConseiller(id: string) {
  return {
    conseillerId: id,
    languages: ['fr' as const],
    specialities: ['lune_de_miel'],
    destinations: [{ country: 'CU' }],
    experienceTier: 'pair' as const,
    fsa: asFsaCode('H2X'),
  };
}

describe('TriggerRematchUseCase', () => {
  it('golden : nouveau MR créé + ancien supersededAt + audit matching.recomputed', async () => {
    const env = buildEnv();
    env.briefReader.add(makeBrief());
    env.conseillerReader.add(makeConseiller('22222222-2222-4222-8222-000000000001'));

    // Première exécution — calcul initial du MR
    const initial = await env.performMatching.execute({ briefId: BRIEF_ID });
    expect(initial.kind).toBe('ok');
    const initialList = env.resultWriter.list();
    expect(initialList).toHaveLength(1);
    const previousId = initialList[0]?.result.id;

    // Trigger re-matching admin
    const result = await env.useCase.execute({
      briefId: BRIEF_ID,
      adminUserId: ADMIN_ID,
      reason: 'Test re-matching post-révocation cascade',
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    // Nouveau MR créé
    const finalList = env.resultWriter.list();
    expect(finalList).toHaveLength(2);
    // Ancien marqué superseded
    const previous = finalList.find((p) => p.result.id === previousId);
    expect(previous?.superseded).toBe(true);
    // Audit matching.recomputed
    expect(env.auditWriter.countByEventType('matching.recomputed')).toBe(1);
  });

  it('brief_not_found : briefId inconnu → no-op', async () => {
    const env = buildEnv();
    const result = await env.useCase.execute({
      briefId: BRIEF_ID,
      adminUserId: ADMIN_ID,
      reason: 'Brief inconnu test',
    });
    expect(result.kind).toBe('no_previous_result');
  });

  it('lock_in_progress : un autre re-matching détient le verrou → 409', async () => {
    const env = buildEnv();
    env.briefReader.add(makeBrief());
    env.conseillerReader.add(makeConseiller('22222222-2222-4222-8222-000000000001'));
    await env.performMatching.execute({ briefId: BRIEF_ID });

    // Acquire le lock manuellement avant le re-trigger
    await env.lock.acquire(BRIEF_ID, 30_000);

    const result = await env.useCase.execute({
      briefId: BRIEF_ID,
      adminUserId: ADMIN_ID,
      reason: 'Concurrent test',
    });

    expect(result.kind).toBe('lock_in_progress');
    expect(env.resultWriter.list()).toHaveLength(1); // pas de doublon
  });

  it('no_previous_result : briefId existe mais pas de MR actif → no-op', async () => {
    const env = buildEnv();
    env.briefReader.add(makeBrief());
    // Aucun MR initial calculé

    const result = await env.useCase.execute({
      briefId: BRIEF_ID,
      adminUserId: ADMIN_ID,
      reason: 'No MR test',
    });
    expect(result.kind).toBe('no_previous_result');
  });
});
