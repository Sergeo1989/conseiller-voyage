// T051 [TDD RED] — Tests PerformMatchingUseCase (US1 P1 MVP).
// Couvre :
//   - golden path : 5 conseillers verified Cuba+FR → status=ok 3 entries
//     + audit `matching.computed` + outbox `voyageur_brief_matched`
//   - partial : 2 conseillers seulement → status=partial + outbox partially_matched
//   - empty : 0 conseiller éligible → status=empty + outbox unmatched
//   - idempotence : replay même briefId → `replay_ignored` + audit dédié
//   - brief_not_found : briefId inconnu
//   - FR-009c : conseiller sans FSA exclu + audit `matching.conseiller_address_missing`
//
// Boost cookie cv_suggested (US2) NON couvert ici — testé en T067 Phase 4.

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
  FakeMatchingResultWriter,
  FakeUuidGenerator,
} from '../../__tests__/_fakes';
import { PerformMatchingUseCase } from '../perform-matching.use-case';

const BRIEF_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-05-31T12:00:00.000Z');

function makeBrief(overrides = {}) {
  return {
    briefId: BRIEF_ID,
    destinations: [{ country: 'CU', region: 'La Havane' }],
    conseillerLanguage: 'fr' as const,
    speciality: 'lune_de_miel' as const,
    familiarity: 'experienced_traveler' as const,
    voyageurFsa: asFsaCode('H7N'),
    suggestedConseillerId: null,
    ...overrides,
  };
}

function makeConseiller(id: string, overrides = {}) {
  return {
    conseillerId: id,
    languages: ['fr' as const],
    specialities: ['lune_de_miel'],
    destinations: [{ country: 'CU' }],
    experienceTier: 'pair' as const,
    fsa: asFsaCode('H2X'),
    ...overrides,
  };
}

function buildUseCase() {
  const briefReader = new FakeBriefSnapshotReader();
  const conseillerReader = new FakeConseillerSnapshotReader();
  const fsaReader = new FakeFsaCentroidReader(
    new Map([
      [asFsaCode('H7N'), { lat: 45.5736, lng: -73.7239, province: 'QC' as const }],
      [asFsaCode('H2X'), { lat: 45.5125, lng: -73.5658, province: 'QC' as const }],
      [asFsaCode('M5V'), { lat: 43.6435, lng: -79.3954, province: 'ON' as const }],
    ]),
  );
  const resultWriter = new FakeMatchingResultWriter();
  const auditWriter = new FakeMatchingAuditWriter();
  const outboxWriter = new FakeMatchingOutboxWriter();
  const useCase = new PerformMatchingUseCase({
    clock: new FakeClock(NOW),
    uuid: new FakeUuidGenerator(),
    briefReader,
    conseillerReader,
    fsaReader,
    resultWriter,
    auditWriter,
    outboxWriter,
    weights: WeightsConfig.DEFAULT_WEIGHTS_V1,
    algorithmVersion: 'v1.0',
  });
  return { useCase, briefReader, conseillerReader, resultWriter, auditWriter, outboxWriter };
}

describe('PerformMatchingUseCase', () => {
  it('golden path : 5 conseillers verified → status=ok 3 entries + outbox matched', async () => {
    const env = buildUseCase();
    env.briefReader.add(makeBrief());
    for (let i = 1; i <= 5; i += 1) {
      env.conseillerReader.add(
        makeConseiller(`22222222-2222-4222-8222-${String(i).padStart(12, '0')}`),
      );
    }

    const result = await env.useCase.execute({ briefId: BRIEF_ID });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.status).toBe('ok');
    expect(result.matchedCount).toBe(3);
    expect(env.resultWriter.list()).toHaveLength(1);
    expect(env.resultWriter.list()[0]?.entries).toHaveLength(3);
    expect(env.outboxWriter.countByEventType('voyageur_brief_matched')).toBe(1);
    expect(env.auditWriter.countByEventType('matching.computed')).toBe(1);
  });

  it('partial : 2 conseillers verified → status=partial + outbox partially_matched', async () => {
    const env = buildUseCase();
    env.briefReader.add(makeBrief());
    env.conseillerReader.add(makeConseiller('22222222-2222-4222-8222-000000000001'));
    env.conseillerReader.add(makeConseiller('22222222-2222-4222-8222-000000000002'));

    const result = await env.useCase.execute({ briefId: BRIEF_ID });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.status).toBe('partial');
    expect(result.matchedCount).toBe(2);
    expect(env.outboxWriter.countByEventType('voyageur_brief_partially_matched')).toBe(1);
    expect(env.auditWriter.countByEventType('matching.partial')).toBe(1);
  });

  it('empty : 0 conseiller éligible → status=empty + outbox unmatched', async () => {
    const env = buildUseCase();
    env.briefReader.add(makeBrief());
    // Aucun conseiller dans le store

    const result = await env.useCase.execute({ briefId: BRIEF_ID });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.status).toBe('empty');
    expect(result.matchedCount).toBe(0);
    expect(env.outboxWriter.countByEventType('voyageur_brief_unmatched')).toBe(1);
    expect(env.auditWriter.countByEventType('matching.empty')).toBe(1);
  });

  it('filtre dur langue Q3 : conseiller EN exclu si voyageur FR', async () => {
    const env = buildUseCase();
    env.briefReader.add(makeBrief({ conseillerLanguage: 'fr' as const }));
    // 1 conseiller EN only — exclu par filtre dur
    env.conseillerReader.add(
      makeConseiller('22222222-2222-4222-8222-000000000001', { languages: ['en' as const] }),
    );

    const result = await env.useCase.execute({ briefId: BRIEF_ID });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.matchedCount).toBe(0); // EN-only exclu
  });

  it('idempotence FR-004 : replay même briefId → replay_ignored + audit dédié', async () => {
    const env = buildUseCase();
    env.briefReader.add(makeBrief());
    env.conseillerReader.add(makeConseiller('22222222-2222-4222-8222-000000000001'));

    const first = await env.useCase.execute({ briefId: BRIEF_ID });
    const second = await env.useCase.execute({ briefId: BRIEF_ID });

    expect(first.kind).toBe('ok');
    expect(second.kind).toBe('replay_ignored');
    expect(env.resultWriter.list()).toHaveLength(1); // jamais 2
    expect(env.auditWriter.countByEventType('matching.replay_ignored')).toBe(1);
  });

  it('brief_not_found : briefId inconnu → audit none, no persistence', async () => {
    const env = buildUseCase();
    // Aucun brief seedé
    const result = await env.useCase.execute({ briefId: BRIEF_ID });
    expect(result.kind).toBe('brief_not_found');
    expect(env.resultWriter.list()).toHaveLength(0);
    expect(env.outboxWriter.entries).toHaveLength(0);
  });

  it('FR-009c : conseiller sans FSA exclu + audit dédié', async () => {
    const env = buildUseCase();
    env.briefReader.add(makeBrief());
    env.conseillerReader.add(makeConseiller('22222222-2222-4222-8222-000000000001', { fsa: null }));
    env.conseillerReader.add(
      makeConseiller('22222222-2222-4222-8222-000000000002'), // a une FSA
    );

    const result = await env.useCase.execute({ briefId: BRIEF_ID });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.matchedCount).toBe(1); // conseiller sans FSA exclu
    expect(env.auditWriter.countByEventType('matching.conseiller_address_missing')).toBe(1);
  });

  it('SC-002 déterminisme : 2 exécutions identiques → mêmes scores', async () => {
    const env1 = buildUseCase();
    env1.briefReader.add(makeBrief());
    env1.conseillerReader.add(makeConseiller('22222222-2222-4222-8222-000000000001'));
    env1.conseillerReader.add(
      makeConseiller('22222222-2222-4222-8222-000000000002', { fsa: asFsaCode('M5V') }),
    );
    const r1 = await env1.useCase.execute({ briefId: BRIEF_ID });

    const env2 = buildUseCase();
    env2.briefReader.add(makeBrief());
    env2.conseillerReader.add(makeConseiller('22222222-2222-4222-8222-000000000001'));
    env2.conseillerReader.add(
      makeConseiller('22222222-2222-4222-8222-000000000002', { fsa: asFsaCode('M5V') }),
    );
    const r2 = await env2.useCase.execute({ briefId: BRIEF_ID });

    expect(r1.kind).toBe('ok');
    expect(r2.kind).toBe('ok');
    const e1 = env1.resultWriter.list()[0]?.entries;
    const e2 = env2.resultWriter.list()[0]?.entries;
    expect(e1).toBeDefined();
    expect(e2).toBeDefined();
    expect(e1?.[0]?.scoreFinal).toBe(e2?.[0]?.scoreFinal);
    expect(e1?.[1]?.scoreFinal).toBe(e2?.[1]?.scoreFinal);
  });
});
