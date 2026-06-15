// T015 [016 US1] — Tests EnrichBriefUseCase (orchestration + invariant anti-PII).
// Pas de DB : fakes en mémoire. Couvre FR-002/003/004/006/017 + idempotence (SC-005).

import type { VoyageurBriefId } from '@cv/shared/intake';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../../../../../common/ports/clock.port';
import { FakeLlmProvider } from '../../../infrastructure/llm/__fakes__/fake-llm-provider';
import type {
  BriefEnrichmentRecord,
  BriefEnrichmentRepository,
  VoyageurBriefReader,
  VoyageurBriefRecord,
} from '../../ports';
import { EnrichBriefUseCase } from '../enrich-brief.use-case';

const BRIEF_ID = 'brief-1' as VoyageurBriefId;
const NOW = new Date('2026-06-15T12:00:00Z');

const clock: Clock = { now: () => NOW, nowMs: () => NOW.getTime() };

function makeBrief(over: Partial<VoyageurBriefRecord> = {}): VoyageurBriefRecord {
  return {
    id: BRIEF_ID,
    voyageurContactId: 'contact-secret' as VoyageurBriefRecord['voyageurContactId'],
    status: 'active',
    submittedAt: NOW,
    verifiedAt: NOW,
    expiresAt: NOW,
    consentGivenAt: NOW,
    erasureRequestedAt: null,
    anonymizedAt: null,
    abuseMarkedAt: null,
    destinations: [{ country: 'IT' }],
    departureDate: NOW,
    returnDate: NOW,
    datesFlexible: false,
    datesFlexibilityDays: null,
    adultsCount: 2,
    childrenAges: [],
    infantsCount: 0,
    budgetRange: 'between_2k_5k',
    budgetNote: null,
    conseillerLanguage: 'fr',
    conseillerLanguageOther: null,
    speciality: 'autre',
    specialityOther: null,
    familiarity: 'occasional_traveler',
    idempotencyKey: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function makeBriefReader(record: VoyageurBriefRecord | null): VoyageurBriefReader {
  const notUsed = () => {
    throw new Error('not used in test');
  };
  return {
    findById: () => Promise.resolve(record),
    findByIdempotencyKey: notUsed,
    listActiveByContactId: notUsed,
    findLatestPendingByContactId: notUsed,
    listUnmatchedSince: notUsed,
  } as unknown as VoyageurBriefReader;
}

class InMemoryRepo implements BriefEnrichmentRepository {
  readonly saved = new Map<string, BriefEnrichmentRecord>();
  constructor(seed?: BriefEnrichmentRecord) {
    if (seed) this.saved.set(seed.briefId, seed);
  }
  findByBriefId(briefId: VoyageurBriefId): Promise<BriefEnrichmentRecord | null> {
    return Promise.resolve(this.saved.get(briefId) ?? null);
  }
  save(record: BriefEnrichmentRecord): Promise<void> {
    this.saved.set(record.briefId, record);
    return Promise.resolve();
  }
}

function makeUseCase(opts: {
  brief: VoyageurBriefRecord | null;
  llm: FakeLlmProvider;
  repo: InMemoryRepo;
}): EnrichBriefUseCase {
  return new EnrichBriefUseCase({
    clock,
    briefReader: makeBriefReader(opts.brief),
    llm: opts.llm,
    repo: opts.repo,
  });
}

describe('EnrichBriefUseCase — cas nominal', () => {
  it("résout 'autre' : persiste enrichi avec spécialité canonique", async () => {
    const repo = new InMemoryRepo();
    const llm = FakeLlmProvider.ok({ speciality: 'lune_de_miel', confidence: 0.9 });
    const uc = makeUseCase({ brief: makeBrief({ specialityOther: 'voyage de noces' }), llm, repo });

    const res = await uc.execute({ briefId: BRIEF_ID });

    expect(res).toEqual({ kind: 'enriched', status: 'enrichi' });
    expect(repo.saved.get(BRIEF_ID)?.enrichedSpeciality).toBe('lune_de_miel');
  });
});

describe('EnrichBriefUseCase — invariant anti-PII du payload (FR-004/FR-017)', () => {
  let llm: FakeLlmProvider;

  beforeEach(async () => {
    const repo = new InMemoryRepo();
    llm = FakeLlmProvider.ok({ confidence: 0.5 });
    const brief = makeBrief({
      budgetNote: 'écris à jean@example.com ou 514-555-1234, lune de miel',
      voyageurContactId: 'contact-secret' as VoyageurBriefRecord['voyageurContactId'],
    });
    await makeUseCase({ brief, llm, repo }).execute({ briefId: BRIEF_ID });
  });

  it('le texte envoyé au LLM ne contient aucune PII de contact', () => {
    const sent = llm.lastInput?.text ?? '';
    expect(sent).not.toContain('jean@example.com');
    expect(sent).not.toContain('514-555-1234');
    expect(sent).toContain('[redacted]');
  });

  it("le texte envoyé au LLM ne contient pas l'identifiant de contact", () => {
    expect(llm.lastInput?.text ?? '').not.toContain('contact-secret');
  });
});

describe('EnrichBriefUseCase — modes dégradés & idempotence', () => {
  it('LLM indisponible → indisponible (jamais de throw)', async () => {
    const repo = new InMemoryRepo();
    const uc = makeUseCase({
      brief: makeBrief({ specialityOther: 'safari' }),
      llm: FakeLlmProvider.unavailable('timeout'),
      repo,
    });
    const res = await uc.execute({ briefId: BRIEF_ID });
    expect(res).toEqual({ kind: 'enriched', status: 'indisponible' });
    expect(repo.saved.get(BRIEF_ID)?.failureReason).toBe('timeout');
  });

  it('sortie hors schéma → indisponible (schema_invalid)', async () => {
    const repo = new InMemoryRepo();
    const llm = FakeLlmProvider.ok({ speciality: 'luxe' }); // pas de confidence
    const uc = makeUseCase({ brief: makeBrief({ specialityOther: 'x' }), llm, repo });
    await uc.execute({ briefId: BRIEF_ID });
    expect(repo.saved.get(BRIEF_ID)?.failureReason).toBe('schema_invalid');
  });

  it('texte libre vide → non_enrichi (empty_input), 0 appel LLM', async () => {
    const repo = new InMemoryRepo();
    const llm = FakeLlmProvider.ok({ confidence: 0.9 });
    const uc = makeUseCase({ brief: makeBrief(), llm, repo }); // pas de texte libre
    const res = await uc.execute({ briefId: BRIEF_ID });
    expect(res).toEqual({ kind: 'enriched', status: 'non_enrichi' });
    expect(llm.callCount).toBe(0);
  });

  it('confiance sous le seuil → partiel (low_confidence)', async () => {
    const repo = new InMemoryRepo();
    const llm = FakeLlmProvider.ok({ speciality: 'luxe', confidence: 0.4 });
    const uc = makeUseCase({ brief: makeBrief({ specialityOther: 'x' }), llm, repo });
    const res = await uc.execute({ briefId: BRIEF_ID });
    expect(res).toEqual({ kind: 'enriched', status: 'partiel' });
  });

  it('enrichissement déjà présent → reused, 0 appel LLM (SC-005)', async () => {
    const seed: BriefEnrichmentRecord = {
      briefId: BRIEF_ID,
      status: 'enrichi',
      enrichedSpeciality: 'luxe',
      enrichedDestinations: [],
      confidence: 0.9,
      failureReason: null,
      providerVersion: 'fake-v1',
      inputTokens: 1,
      outputTokens: 1,
      createdAt: NOW,
    };
    const repo = new InMemoryRepo(seed);
    const llm = FakeLlmProvider.ok({ confidence: 0.9 });
    const uc = makeUseCase({ brief: makeBrief({ specialityOther: 'x' }), llm, repo });
    const res = await uc.execute({ briefId: BRIEF_ID });
    expect(res).toEqual({ kind: 'reused' });
    expect(llm.callCount).toBe(0);
  });

  it('brief introuvable → brief_not_found', async () => {
    const uc = makeUseCase({
      brief: null,
      llm: FakeLlmProvider.ok({ confidence: 0.9 }),
      repo: new InMemoryRepo(),
    });
    expect(await uc.execute({ briefId: BRIEF_ID })).toEqual({ kind: 'brief_not_found' });
  });
});
