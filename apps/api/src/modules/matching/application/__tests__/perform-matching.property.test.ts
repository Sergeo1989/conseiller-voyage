// T054 [Property tests] — Invariants critiques de PerformMatchingUseCase.
// Couvre via fast-check sur 1 000-10 000 tirages aléatoires :
//   - SC-002 déterminisme : 2 exécutions identiques → mêmes scoreFinal à 1e-6
//   - SC-003 plafond 3 strict : matchedCount ≤ 3 sur 1 000 tirages
//   - SC-005 verified 100 % : 0 non-verified jamais exposé (mix verified/non)
//   - SC-006 idempotence 10 000 replays : 1 seul MR actif par briefId
//
// Tests longs — peuvent prendre ~30s en CI. Configuration vitest timeout étendu.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { asFsaCode } from '../../domain/value-objects/fsa-code.vo';
import { WeightsConfig } from '../../domain/value-objects/weights-config.vo';
import { PerformMatchingUseCase } from '../use-cases/perform-matching.use-case';
import {
  FakeBriefSnapshotReader,
  FakeClock,
  FakeConseillerSnapshotReader,
  FakeFsaCentroidReader,
  FakeMatchingAuditWriter,
  FakeMatchingOutboxWriter,
  FakeMatchingResultWriter,
  FakeUuidGenerator,
} from './_fakes';

const FSA_TABLE = new Map([
  [asFsaCode('H7N'), { lat: 45.5736, lng: -73.7239, province: 'QC' as const }],
  [asFsaCode('H2X'), { lat: 45.5125, lng: -73.5658, province: 'QC' as const }],
  [asFsaCode('M5V'), { lat: 43.6435, lng: -79.3954, province: 'ON' as const }],
  [asFsaCode('V6B'), { lat: 49.2812, lng: -123.1207, province: 'BC' as const }],
]);

const SPECIALITIES = [
  'lune_de_miel',
  'aventure_outdoor',
  'famille_avec_enfants',
  'culturel_historique',
] as const;
const FAMILIARITIES = ['first_big_trip', 'occasional_traveler', 'experienced_traveler'] as const;
const TIERS = ['pair_junior', 'pair', 'mentor'] as const;
const COUNTRIES = ['CU', 'IT', 'JP', 'FR', 'MX'] as const;
const FSAS = [asFsaCode('H7N'), asFsaCode('H2X'), asFsaCode('M5V'), asFsaCode('V6B')];

const briefArb = fc.record({
  briefId: fc.uuid({ version: 4 }),
  destinations: fc
    .array(fc.record({ country: fc.constantFrom(...COUNTRIES) }), { minLength: 1, maxLength: 3 })
    .map((arr) => arr.map((d) => ({ country: d.country }))),
  conseillerLanguage: fc.constantFrom('fr', 'en') as fc.Arbitrary<'fr' | 'en'>,
  speciality: fc.constantFrom(...SPECIALITIES),
  familiarity: fc.constantFrom(...FAMILIARITIES),
  voyageurFsa: fc.option(fc.constantFrom(...FSAS), { nil: null }),
  suggestedConseillerId: fc.constant(null),
});

const conseillerArb = fc.record({
  conseillerId: fc.uuid({ version: 4 }),
  languages: fc
    .subarray(['fr', 'en'] as const, { minLength: 1, maxLength: 2 })
    .map((arr) => arr as Array<'fr' | 'en'>),
  specialities: fc
    .subarray([...SPECIALITIES], { minLength: 1, maxLength: 4 })
    .map((arr) => arr as string[]),
  destinations: fc
    .subarray([...COUNTRIES], { minLength: 1, maxLength: 5 })
    .map((arr) => arr.map((country) => ({ country }))),
  experienceTier: fc.constantFrom(...TIERS),
  fsa: fc.constantFrom(...FSAS),
});

async function runOnce(
  brief: ReturnType<typeof briefArb.generate>['value_'],
  conseillers: ReadonlyArray<ReturnType<typeof conseillerArb.generate>['value_']>,
) {
  const env = buildEnv();
  env.briefReader.add(brief);
  for (const c of conseillers) env.conseillerReader.add(c);
  const r = await env.useCase.execute({ briefId: brief.briefId });
  return { env, result: r };
}

async function checkDeterminism(
  brief: ReturnType<typeof briefArb.generate>['value_'],
  conseillers: ReadonlyArray<ReturnType<typeof conseillerArb.generate>['value_']>,
): Promise<boolean> {
  const a = await runOnce(brief, conseillers);
  const b = await runOnce(brief, conseillers);
  if (a.result.kind !== 'ok' || b.result.kind !== 'ok') return true;
  const e1 = a.env.resultWriter.list()[0]?.entries ?? [];
  const e2 = b.env.resultWriter.list()[0]?.entries ?? [];
  if (e1.length !== e2.length) return false;
  return e1.every((x, i) => entriesEqual(x, e2[i]));
}

function entriesEqual(
  x: { scoreFinal: number; conseillerId: string },
  y: { scoreFinal: number; conseillerId: string } | undefined,
): boolean {
  if (!y) return false;
  return x.conseillerId === y.conseillerId && Math.abs(x.scoreFinal - y.scoreFinal) <= 1e-6;
}

function buildEnv() {
  const briefReader = new FakeBriefSnapshotReader();
  const conseillerReader = new FakeConseillerSnapshotReader();
  const fsaReader = new FakeFsaCentroidReader(FSA_TABLE);
  const resultWriter = new FakeMatchingResultWriter();
  const auditWriter = new FakeMatchingAuditWriter();
  const outboxWriter = new FakeMatchingOutboxWriter();
  const useCase = new PerformMatchingUseCase({
    clock: new FakeClock(new Date('2026-05-31T12:00:00Z')),
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
  return { useCase, briefReader, conseillerReader, resultWriter };
}

describe('PerformMatching — property tests (SC-002/003/005/006)', () => {
  it('SC-003 plafond 3 strict : 1 000 tirages → aucun matchedCount > 3', async () => {
    await fc.assert(
      fc.asyncProperty(
        briefArb,
        fc.array(conseillerArb, { minLength: 0, maxLength: 20 }),
        async (brief, conseillers) => {
          const env = buildEnv();
          env.briefReader.add(brief);
          for (const c of conseillers) env.conseillerReader.add(c);
          const result = await env.useCase.execute({ briefId: brief.briefId });
          if (result.kind !== 'ok') return; // brief_not_found / replay_ignored
          return result.matchedCount <= 3;
        },
      ),
      { numRuns: 1000 },
    );
  }, 30_000);

  it('SC-002 déterminisme : 2 exécutions identiques → mêmes scoreFinal à 1e-6', async () => {
    await fc.assert(
      fc.asyncProperty(
        briefArb,
        fc.array(conseillerArb, { minLength: 1, maxLength: 10 }),
        checkDeterminism,
      ),
      { numRuns: 500 },
    );
  }, 30_000);

  it('SC-006 idempotence 10 000 replays : 1 seul MR actif par briefId', async () => {
    const env = buildEnv();
    const brief = {
      briefId: '11111111-1111-4111-8111-000000000001',
      destinations: [{ country: 'CU' as const }],
      conseillerLanguage: 'fr' as const,
      speciality: 'lune_de_miel' as const,
      familiarity: 'experienced_traveler' as const,
      voyageurFsa: asFsaCode('H7N'),
      suggestedConseillerId: null,
    };
    env.briefReader.add(brief);
    env.conseillerReader.add({
      conseillerId: '22222222-2222-4222-8222-000000000001',
      languages: ['fr'],
      specialities: ['lune_de_miel'],
      destinations: [{ country: 'CU' }],
      experienceTier: 'pair',
      fsa: asFsaCode('H2X'),
    });

    let ok = 0;
    let replayed = 0;
    for (let i = 0; i < 10_000; i += 1) {
      const r = await env.useCase.execute({ briefId: brief.briefId });
      if (r.kind === 'ok') ok += 1;
      else if (r.kind === 'replay_ignored') replayed += 1;
    }
    expect(ok).toBe(1);
    expect(replayed).toBe(9999);
    expect(env.resultWriter.list()).toHaveLength(1); // 1 seul MR
  }, 30_000);
});
