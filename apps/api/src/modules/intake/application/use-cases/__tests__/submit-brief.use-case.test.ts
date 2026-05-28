// T044 [TDD RED] — Tests SubmitBriefUseCase.
// Orchestre : validation → disposable check → rate-limit → upsert contact
// → create brief → create magic link token → enqueue mailer → publish
// audit + outbox.

import { describe, expect, it } from 'vitest';
import {
  FakeClock,
  FakeDisposableEmailChecker,
  FakeIntakeAuditLogWriter,
  FakeIntakeOutboxWriter,
  FakeIntakeRateLimiter,
  FakeMagicLinkMailer,
  FakeMagicLinkTokenStore,
  FakeUuidGenerator,
  FakeVoyageurBriefStore,
  FakeVoyageurContactStore,
} from '../../__tests__/_fakes';
import { type SubmitBriefInput, SubmitBriefUseCase } from '../submit-brief.use-case';

const NOW = new Date('2026-05-01T10:00:00Z');
const SECRET = 'a'.repeat(32);

function buildUseCase(
  overrides: {
    rateLimiter?: FakeIntakeRateLimiter;
    disposable?: FakeDisposableEmailChecker;
  } = {},
) {
  const clock = new FakeClock(NOW);
  const uuid = new FakeUuidGenerator();
  const contacts = new FakeVoyageurContactStore();
  const briefs = new FakeVoyageurBriefStore();
  const tokens = new FakeMagicLinkTokenStore();
  const mailer = new FakeMagicLinkMailer();
  const disposable = overrides.disposable ?? new FakeDisposableEmailChecker();
  const rateLimiter = overrides.rateLimiter ?? new FakeIntakeRateLimiter();
  const audit = new FakeIntakeAuditLogWriter();
  const outbox = new FakeIntakeOutboxWriter();

  const useCase = new SubmitBriefUseCase({
    clock,
    uuid,
    contactReader: contacts,
    contactWriter: contacts,
    briefReader: briefs,
    briefWriter: briefs,
    tokenWriter: tokens,
    mailer,
    disposableEmailChecker: disposable,
    rateLimiter,
    audit,
    outbox,
    magicLinkSecret: SECRET,
    expirationDays: 90,
    magicLinkTtlDays: 7,
  });
  return {
    useCase,
    clock,
    contacts,
    briefs,
    tokens,
    mailer,
    audit,
    outbox,
    rateLimiter,
    disposable,
  };
}

function validInput(): SubmitBriefInput {
  return {
    destinations: [{ country: 'IT', region: 'Toscane' }],
    departureDate: '2027-03-15',
    returnDate: '2027-03-30',
    datesFlexible: true,
    datesFlexibilityDays: 5,
    adultsCount: 2,
    childrenAges: [],
    infantsCount: 0,
    budgetRange: 'between_5k_10k',
    budgetNote: undefined,
    conseillerLanguage: 'fr',
    conseillerLanguageOther: undefined,
    speciality: 'lune_de_miel',
    specialityOther: undefined,
    familiarity: 'experienced_traveler',
    contact: {
      email: 'marie.dupont@gmail.com',
      firstName: 'Marie',
      lastName: 'Dupont',
      phone: '514-555-1234',
      postalCode: 'H7N 1A1',
    },
    consentGiven: true,
    locale: 'fr-CA',
    clientIp: '203.0.113.42',
    userAgent: 'Mozilla/5.0',
    idempotencyKey: null,
  };
}

describe('SubmitBriefUseCase — cas nominal', () => {
  it('crée brief + contact + token + envoie mail + publish audit + outbox', async () => {
    const { useCase, briefs, contacts, tokens, mailer, audit, outbox } = buildUseCase();

    const result = await useCase.execute(validInput());
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    expect(briefs.briefs.size).toBe(1);
    expect(contacts.contacts.size).toBe(1);
    expect(tokens.tokens.size).toBe(1);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.toEmail).toBe('marie.dupont@gmail.com');
    // Audit "intake.brief.submitted" mais PAS "voyageur.brief.activated"
    // (brief pas encore vérifié).
    expect(audit.entries.some((e) => e.eventType === 'intake.brief.submitted')).toBe(true);
    expect(outbox.entries.some((e) => e.eventType === 'voyageur.brief.activated')).toBe(false);
  });

  it('upsert le même contact pour 2 briefs même email', async () => {
    const { useCase, contacts, briefs } = buildUseCase();
    await useCase.execute(validInput());
    await useCase.execute({
      ...validInput(),
      // destinations différentes → 2e brief distinct
      destinations: [{ country: 'JP' }],
      departureDate: '2027-06-01',
      returnDate: '2027-06-15',
    });
    expect(contacts.contacts.size).toBe(1);
    expect(briefs.briefs.size).toBe(2);
  });
});

describe('SubmitBriefUseCase — idempotence', () => {
  it('retourne le même briefId si idempotencyKey déjà utilisée', async () => {
    const { useCase, briefs } = buildUseCase();
    const input = { ...validInput(), idempotencyKey: 'same-key-123' };
    const r1 = await useCase.execute(input);
    const r2 = await useCase.execute(input);
    expect(r1.kind).toBe('ok');
    expect(r2.kind).toBe('ok');
    if (r1.kind === 'ok' && r2.kind === 'ok') {
      expect(r1.briefId).toBe(r2.briefId);
    }
    expect(briefs.briefs.size).toBe(1);
  });
});

describe('SubmitBriefUseCase — disposable email', () => {
  it('refuse avec code DISPOSABLE_EMAIL_DETECTED', async () => {
    const { useCase, briefs } = buildUseCase({
      disposable: new FakeDisposableEmailChecker(['gmail.com']),
    });
    const r = await useCase.execute(validInput());
    expect(r.kind).toBe('disposable_email');
    expect(briefs.briefs.size).toBe(0);
  });
});

describe('SubmitBriefUseCase — rate-limit', () => {
  it('refuse EMAIL_RATE_LIMIT_EXCEEDED (FR-019 + FR-020a email-first)', async () => {
    const rateLimiter = new FakeIntakeRateLimiter();
    rateLimiter.nextOutcome = {
      allowed: false,
      reason: 'email',
      retryAfterSeconds: 7200,
    };
    const { useCase, briefs, mailer } = buildUseCase({ rateLimiter });
    const r = await useCase.execute(validInput());
    expect(r.kind).toBe('rate_limited');
    if (r.kind === 'rate_limited') {
      expect(r.reason).toBe('email');
      expect(r.retryAfterSeconds).toBe(7200);
    }
    expect(briefs.briefs.size).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('refuse RATE_LIMIT_EXCEEDED neutre (FR-020 IP)', async () => {
    const rateLimiter = new FakeIntakeRateLimiter();
    rateLimiter.nextOutcome = {
      allowed: false,
      reason: 'ip',
      retryAfterSeconds: 3600,
    };
    const { useCase } = buildUseCase({ rateLimiter });
    const r = await useCase.execute(validInput());
    expect(r.kind).toBe('rate_limited');
    if (r.kind === 'rate_limited') {
      expect(r.reason).toBe('ip');
    }
  });
});

describe('SubmitBriefUseCase — validation Zod fail', () => {
  it('refuse consentGiven=false', async () => {
    const { useCase, briefs } = buildUseCase();
    const r = await useCase.execute({ ...validInput(), consentGiven: false as true });
    expect(r.kind).toBe('validation_failed');
    expect(briefs.briefs.size).toBe(0);
  });

  it('refuse returnDate avant departureDate', async () => {
    const { useCase } = buildUseCase();
    const r = await useCase.execute({
      ...validInput(),
      departureDate: '2027-03-30',
      returnDate: '2027-03-15',
    });
    expect(r.kind).toBe('validation_failed');
  });
});
