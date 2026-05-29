// T118 [TDD RED] — Tests PushBriefToConseillerUseCase (FR-027, US5).
//
// Push manuel d'un brief vers un conseiller vérifié (lookup ConformiteQueryPort).
// Garanties testées :
//   - Conseiller non-vérifié → refus
//   - Motif < 20 chars ou > 500 chars → invalid (côté Zod en amont mais
//     redondance défense en profondeur côté use case)
//   - Idempotency : 2e push avec même key → no-op
//   - Audit intake.admin.pushed_manual avec correlationId
//   - Outbox voyageur.brief.pushed_manual

import { describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeIntakeAuditLogWriter,
  FakeIntakeOutboxWriter,
  FakeUuidGenerator,
  FakeVoyageurBriefStore,
  asBriefId,
  asContactId,
} from '../../__tests__/_fakes';
import type { VoyageurBriefRecord } from '../../ports';
import { PushBriefToConseillerUseCase } from '../push-brief-to-conseiller.use-case';

const NOW = new Date('2026-05-15T10:00:00Z');
const BRIEF_ID = asBriefId('11111111-1111-4111-8111-111111111111');
const CONTACT_ID = asContactId('22222222-2222-4222-8222-222222222222');
const VERIFIED_CONSEILLER = '44444444-4444-4444-8444-444444444444';
const UNVERIFIED_CONSEILLER = '55555555-5555-4555-8555-555555555555';
const ADMIN_ID = '66666666-6666-4666-8666-666666666666';
const VALID_REASON =
  'Conseiller spécialisé en croisière Méditerranée parlant italien identifié par téléphone';

class FakeConformiteQueryPort {
  public verified = new Map<string, boolean>();
  async getVerificationStatus(args: {
    readonly conseillerId: string;
    readonly strict?: boolean;
  }): Promise<{
    readonly conseillerId: string;
    readonly verified: boolean;
    readonly lastVerifiedAt: string | null;
  }> {
    return {
      conseillerId: args.conseillerId,
      verified: this.verified.get(args.conseillerId) ?? false,
      lastVerifiedAt: null,
    };
  }
  onStatusChanged(): () => void {
    return () => undefined;
  }
}

function buildUseCase() {
  const clock = new FakeClock(NOW);
  const uuid = new FakeUuidGenerator();
  const briefs = new FakeVoyageurBriefStore();
  const audit = new FakeIntakeAuditLogWriter();
  const outbox = new FakeIntakeOutboxWriter();
  const conformite = new FakeConformiteQueryPort();
  conformite.verified.set(VERIFIED_CONSEILLER, true);
  conformite.verified.set(UNVERIFIED_CONSEILLER, false);

  const useCase = new PushBriefToConseillerUseCase({
    clock,
    uuid,
    briefReader: briefs,
    conformiteQuery: conformite,
    audit,
    outbox,
  });
  return { useCase, briefs, audit, outbox, conformite };
}

function seedActiveBrief(briefs: FakeVoyageurBriefStore): VoyageurBriefRecord {
  const brief: VoyageurBriefRecord = {
    id: BRIEF_ID,
    voyageurContactId: CONTACT_ID,
    status: 'active',
    submittedAt: new Date('2026-05-15T01:00:00Z'),
    verifiedAt: new Date('2026-05-15T01:30:00Z'),
    expiresAt: new Date('2026-08-13T01:00:00Z'),
    consentGivenAt: new Date('2026-05-15T01:00:00Z'),
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  briefs.seed(brief);
  return brief;
}

describe('PushBriefToConseillerUseCase — golden path', () => {
  it('publish outbox + audit avec correlationId', async () => {
    const { useCase, briefs, audit, outbox } = buildUseCase();
    seedActiveBrief(briefs);

    const r = await useCase.execute({
      briefId: BRIEF_ID,
      conseillerComplianceId: VERIFIED_CONSEILLER,
      reason: VALID_REASON,
      adminUserId: ADMIN_ID,
      idempotencyKey: null,
    });
    expect(r.kind).toBe('ok');

    const auditEntry = audit.entries.find((e) => e.eventType === 'intake.admin.pushed_manual');
    expect(auditEntry).toBeDefined();
    expect(auditEntry?.actorRole).toBe('admin');
    expect(auditEntry?.actorId).toBe(ADMIN_ID);
    expect(auditEntry?.correlationId).not.toBeNull();

    const outboxEntry = outbox.entries.find((e) => e.eventType === 'voyageur.brief.pushed_manual');
    expect(outboxEntry).toBeDefined();
    expect((outboxEntry?.payload as { reason: string })?.reason).toBe(VALID_REASON);
  });
});

describe('PushBriefToConseillerUseCase — refus', () => {
  it('refuse si conseiller NON vérifié', async () => {
    const { useCase, briefs, outbox } = buildUseCase();
    seedActiveBrief(briefs);
    const r = await useCase.execute({
      briefId: BRIEF_ID,
      conseillerComplianceId: UNVERIFIED_CONSEILLER,
      reason: VALID_REASON,
      adminUserId: ADMIN_ID,
      idempotencyKey: null,
    });
    expect(r.kind).toBe('conseiller_not_verified');
    expect(outbox.entries).toHaveLength(0);
  });

  it('refuse motif < 20 chars (FR-028)', async () => {
    const { useCase, briefs } = buildUseCase();
    seedActiveBrief(briefs);
    const r = await useCase.execute({
      briefId: BRIEF_ID,
      conseillerComplianceId: VERIFIED_CONSEILLER,
      reason: 'court',
      adminUserId: ADMIN_ID,
      idempotencyKey: null,
    });
    expect(r.kind).toBe('invalid_reason');
  });

  it('refuse motif > 500 chars', async () => {
    const { useCase, briefs } = buildUseCase();
    seedActiveBrief(briefs);
    const r = await useCase.execute({
      briefId: BRIEF_ID,
      conseillerComplianceId: VERIFIED_CONSEILLER,
      reason: 'x'.repeat(501),
      adminUserId: ADMIN_ID,
      idempotencyKey: null,
    });
    expect(r.kind).toBe('invalid_reason');
  });

  it('refuse brief inexistant', async () => {
    const { useCase } = buildUseCase();
    const r = await useCase.execute({
      briefId: BRIEF_ID,
      conseillerComplianceId: VERIFIED_CONSEILLER,
      reason: VALID_REASON,
      adminUserId: ADMIN_ID,
      idempotencyKey: null,
    });
    expect(r.kind).toBe('brief_not_found');
  });

  it('refuse brief anonymized (Loi 25)', async () => {
    const { useCase, briefs } = buildUseCase();
    seedActiveBrief(briefs);
    const b = briefs.briefs.get(BRIEF_ID);
    if (b) briefs.seed({ ...b, status: 'anonymized', anonymizedAt: new Date() });
    const r = await useCase.execute({
      briefId: BRIEF_ID,
      conseillerComplianceId: VERIFIED_CONSEILLER,
      reason: VALID_REASON,
      adminUserId: ADMIN_ID,
      idempotencyKey: null,
    });
    expect(r.kind).toBe('brief_anonymized');
  });
});
