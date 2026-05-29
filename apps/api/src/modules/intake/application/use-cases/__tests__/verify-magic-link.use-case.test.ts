// T046 [TDD RED] — Tests VerifyMagicLinkUseCase.
// Cas nominal + token expiré + déjà consommé + brief anonymisé.

import { describe, expect, it } from 'vitest';
import { hashToken } from '../../../domain/entities/magic-link-token.entity';
import {
  FakeClock,
  FakeIntakeAuditLogWriter,
  FakeIntakeOutboxWriter,
  FakeMagicLinkTokenStore,
  FakeUuidGenerator,
  FakeVoyageurBriefStore,
  asBriefId,
  asContactId,
  asTokenId,
} from '../../__tests__/_fakes';
import type { VoyageurBriefRecord } from '../../ports';
import { VerifyMagicLinkUseCase } from '../verify-magic-link.use-case';

const NOW = new Date('2026-05-15T10:00:00Z');
const BRIEF_ID = asBriefId('11111111-1111-4111-8111-111111111111');
const CONTACT_ID = asContactId('22222222-2222-4222-8222-222222222222');
const TOKEN_ID = asTokenId('33333333-3333-4333-8333-333333333333');

function buildUseCase() {
  const clock = new FakeClock(NOW);
  const uuid = new FakeUuidGenerator();
  const briefs = new FakeVoyageurBriefStore();
  const tokens = new FakeMagicLinkTokenStore();
  const audit = new FakeIntakeAuditLogWriter();
  const outbox = new FakeIntakeOutboxWriter();

  const useCase = new VerifyMagicLinkUseCase({
    clock,
    uuid,
    briefReader: briefs,
    briefWriter: briefs,
    tokenWriter: tokens,
    audit,
    outbox,
  });
  return { useCase, clock, briefs, tokens, audit, outbox };
}

function seedPendingBrief(briefs: FakeVoyageurBriefStore): void {
  const brief: VoyageurBriefRecord = {
    id: BRIEF_ID,
    voyageurContactId: CONTACT_ID,
    status: 'pending_verification',
    submittedAt: new Date('2026-05-15T09:00:00Z'),
    verifiedAt: null,
    expiresAt: new Date('2026-08-13T09:00:00Z'),
    consentGivenAt: new Date('2026-05-15T09:00:00Z'),
    erasureRequestedAt: null,
    anonymizedAt: null,
    abuseMarkedAt: null,
    destinations: [{ country: 'IT' }],
    departureDate: new Date('2027-03-15'),
    returnDate: new Date('2027-03-30'),
    datesFlexible: false,
    datesFlexibilityDays: null,
    adultsCount: 2,
    childrenAges: [],
    infantsCount: 0,
    budgetRange: 'between_5k_10k',
    budgetNote: null,
    conseillerLanguage: 'fr',
    conseillerLanguageOther: null,
    speciality: 'lune_de_miel',
    specialityOther: null,
    familiarity: 'experienced_traveler',
    idempotencyKey: null,
    createdAt: new Date('2026-05-15T09:00:00Z'),
    updatedAt: new Date('2026-05-15T09:00:00Z'),
  };
  briefs.seed(brief);
}

describe('VerifyMagicLinkUseCase — cas nominal', () => {
  it('passe brief de pending_verification à active + publish outbox + audit', async () => {
    const { useCase, briefs, tokens, audit, outbox } = buildUseCase();
    seedPendingBrief(briefs);
    const clear = 'a'.repeat(64);
    await tokens.create({
      id: TOKEN_ID,
      briefId: BRIEF_ID,
      tokenHash: hashToken(clear),
      purpose: 'verify_email',
      expiresAt: new Date('2026-05-22T10:00:00Z'),
    });

    const r = await useCase.execute({ clearToken: clear });
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.briefId).toBe(BRIEF_ID);
      expect(r.status).toBe('active');
    }
    expect(briefs.briefs.get(BRIEF_ID)?.status).toBe('active');
    expect(tokens.tokens.get(TOKEN_ID)?.consumedAt).not.toBeNull();
    expect(audit.entries.some((e) => e.eventType === 'intake.brief.verified')).toBe(true);
    expect(outbox.entries.some((e) => e.eventType === 'voyageur.brief.activated')).toBe(true);
  });
});

describe('VerifyMagicLinkUseCase — token introuvable', () => {
  it('renvoie token_not_found si hash inexistant', async () => {
    const { useCase } = buildUseCase();
    const r = await useCase.execute({ clearToken: 'b'.repeat(64) });
    expect(r.kind).toBe('token_not_found');
  });
});

describe('VerifyMagicLinkUseCase — token expiré', () => {
  it('renvoie token_expired si expiresAt < now', async () => {
    const { useCase, briefs, tokens } = buildUseCase();
    seedPendingBrief(briefs);
    const clear = 'c'.repeat(64);
    await tokens.create({
      id: TOKEN_ID,
      briefId: BRIEF_ID,
      tokenHash: hashToken(clear),
      purpose: 'verify_email',
      expiresAt: new Date('2026-05-14T10:00:00Z'), // expiré
    });

    const r = await useCase.execute({ clearToken: clear });
    expect(r.kind).toBe('token_expired');
    expect(briefs.briefs.get(BRIEF_ID)?.status).toBe('pending_verification');
  });
});

describe('VerifyMagicLinkUseCase — déjà consommé', () => {
  it('renvoie token_already_consumed si consumedAt set', async () => {
    const { useCase, briefs, tokens } = buildUseCase();
    seedPendingBrief(briefs);
    const clear = 'd'.repeat(64);
    await tokens.create({
      id: TOKEN_ID,
      briefId: BRIEF_ID,
      tokenHash: hashToken(clear),
      purpose: 'verify_email',
      expiresAt: new Date('2026-05-22T10:00:00Z'),
    });
    await tokens.markConsumed({ tokenId: TOKEN_ID, consumedAt: new Date('2026-05-15T09:30:00Z') });

    const r = await useCase.execute({ clearToken: clear });
    expect(r.kind).toBe('token_already_consumed');
  });
});

describe('VerifyMagicLinkUseCase — brief anonymisé', () => {
  it('renvoie brief_anonymised si brief.status=anonymized', async () => {
    const { useCase, briefs, tokens } = buildUseCase();
    seedPendingBrief(briefs);
    const b = briefs.briefs.get(BRIEF_ID);
    if (b) {
      briefs.seed({ ...b, status: 'anonymized', anonymizedAt: new Date('2026-05-15T08:00:00Z') });
    }
    const clear = 'e'.repeat(64);
    await tokens.create({
      id: TOKEN_ID,
      briefId: BRIEF_ID,
      tokenHash: hashToken(clear),
      purpose: 'verify_email',
      expiresAt: new Date('2026-05-22T10:00:00Z'),
    });

    const r = await useCase.execute({ clearToken: clear });
    expect(r.kind).toBe('brief_anonymised');
  });
});
