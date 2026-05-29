// Fakes en mémoire des ports intake — utilisés par les tests unitaires
// des use cases. Underscore prefix → ignoré par vitest.

import type {
  IntakeAuditEntryId,
  IntakeOutboxEntryId,
  MagicLinkTokenId,
  VoyageurBriefId,
  VoyageurContactId,
} from '@cv/shared/intake';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { VoyageurContact } from '../../domain/entities/voyageur-contact.entity';
import type {
  CreateBriefInput,
  CreateTokenInput,
  DisposableEmailChecker,
  IntakeAuditEntryInput,
  IntakeAuditLogWriter,
  IntakeOutboxEntryInput,
  IntakeOutboxWriter,
  IntakeRateLimiter,
  MagicLinkMailer,
  MagicLinkTokenRecord,
  MagicLinkTokenWriter,
  RateLimitInput,
  RateLimitOutcome,
  SendMagicLinkInput,
  UpsertContactInput,
  VoyageurBriefReader,
  VoyageurBriefRecord,
  VoyageurBriefWriter,
  VoyageurContactReader,
  VoyageurContactRecord,
  VoyageurContactWriter,
} from '../ports';

// =====================================================================
// Clock + UuidGenerator
// =====================================================================

export class FakeClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  nowMs(): number {
    return this.current.getTime();
  }
  set(d: Date): void {
    this.current = d;
  }
  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class FakeUuidGenerator implements UuidGenerator {
  private counter = 0;
  private readonly base = '00000000-0000-4000-8000-000000000000';

  generate(): string {
    this.counter += 1;
    const hex = this.counter.toString(16).padStart(12, '0');
    return `${this.base.slice(0, -12)}${hex}`;
  }
}

// =====================================================================
// VoyageurContact fake
// =====================================================================

export class FakeVoyageurContactStore implements VoyageurContactReader, VoyageurContactWriter {
  public contacts = new Map<VoyageurContactId, VoyageurContact>();
  public byEmail = new Map<string, VoyageurContactId>();
  public byEmailHash = new Map<string, VoyageurContactId>();

  async findById(id: VoyageurContactId): Promise<VoyageurContactRecord | null> {
    const c = this.contacts.get(id);
    return c ? toRecord(c) : null;
  }
  async findByEmail(email: string): Promise<VoyageurContactRecord | null> {
    const id = this.byEmail.get(email.toLowerCase());
    if (!id) return null;
    const c = this.contacts.get(id);
    return c ? toRecord(c) : null;
  }
  async findByEmailHashAfterErasure(hash: string): Promise<VoyageurContactRecord | null> {
    const id = this.byEmailHash.get(hash);
    if (!id) return null;
    const c = this.contacts.get(id);
    return c ? toRecord(c) : null;
  }
  async upsertByEmail(input: UpsertContactInput): Promise<VoyageurContactId> {
    const existingId = this.byEmail.get(input.email.toLowerCase());
    if (existingId) {
      const existing = this.contacts.get(existingId);
      if (existing) {
        this.contacts.set(existingId, {
          ...existing,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          postalCode: input.postalCode,
        });
      }
      return existingId;
    }
    const next: VoyageurContact = {
      id: input.id,
      email: input.email.toLowerCase(),
      emailHashAfterErasure: null,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      postalCode: input.postalCode,
      briefsCount24h: 0,
      briefsCount24hWindowStart: null,
      anonymizedAt: null,
    };
    this.contacts.set(input.id, next);
    this.byEmail.set(input.email.toLowerCase(), input.id);
    return input.id;
  }
  async applyAnonymisation(args: {
    contactId: VoyageurContactId;
    emailHashAfterErasure: string;
    anonymizedAt: Date;
  }): Promise<void> {
    const c = this.contacts.get(args.contactId);
    if (!c) return;
    this.contacts.set(args.contactId, {
      ...c,
      firstName: null,
      lastName: null,
      phone: null,
      postalCode: null,
      email: null,
      emailHashAfterErasure: args.emailHashAfterErasure,
      anonymizedAt: args.anonymizedAt,
    });
    if (c.email) this.byEmail.delete(c.email);
    this.byEmailHash.set(args.emailHashAfterErasure, args.contactId);
  }
}

function toRecord(c: VoyageurContact): VoyageurContactRecord {
  return {
    id: c.id,
    email: c.email,
    emailHashAfterErasure: c.emailHashAfterErasure,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    postalCode: c.postalCode,
    briefsCount24h: c.briefsCount24h,
    briefsCount24hWindowStart: c.briefsCount24hWindowStart,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    anonymizedAt: c.anonymizedAt,
  };
}

// =====================================================================
// VoyageurBrief fake
// =====================================================================

export class FakeVoyageurBriefStore implements VoyageurBriefReader, VoyageurBriefWriter {
  public briefs = new Map<VoyageurBriefId, VoyageurBriefRecord>();
  public byIdempotency = new Map<string, VoyageurBriefId>();

  async findById(id: VoyageurBriefId): Promise<VoyageurBriefRecord | null> {
    return this.briefs.get(id) ?? null;
  }
  async findByIdempotencyKey(key: string): Promise<VoyageurBriefRecord | null> {
    const id = this.byIdempotency.get(key);
    return id ? (this.briefs.get(id) ?? null) : null;
  }
  async listActiveByContactId(contactId: VoyageurContactId) {
    return Array.from(this.briefs.values()).filter(
      (b) => b.voyageurContactId === contactId && b.status === 'active',
    );
  }
  async findLatestPendingByContactId(contactId: VoyageurContactId) {
    const pending = Array.from(this.briefs.values()).filter(
      (b) => b.voyageurContactId === contactId && b.status === 'pending_verification',
    );
    if (pending.length === 0) return null;
    return pending.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0] ?? null;
  }
  async listUnmatchedSince() {
    return { items: [], total: 0 };
  }

  async create(input: CreateBriefInput): Promise<void> {
    const record: VoyageurBriefRecord = {
      id: input.id,
      voyageurContactId: input.voyageurContactId,
      status: 'pending_verification',
      submittedAt: new Date(),
      verifiedAt: null,
      expiresAt: input.expiresAt,
      consentGivenAt: input.consentGivenAt,
      erasureRequestedAt: null,
      anonymizedAt: null,
      abuseMarkedAt: null,
      destinations: input.destinations,
      departureDate: input.departureDate,
      returnDate: input.returnDate,
      datesFlexible: input.datesFlexible,
      datesFlexibilityDays: input.datesFlexibilityDays,
      adultsCount: input.adultsCount,
      childrenAges: input.childrenAges,
      infantsCount: input.infantsCount,
      budgetRange: input.budgetRange,
      budgetNote: input.budgetNote,
      conseillerLanguage: input.conseillerLanguage,
      conseillerLanguageOther: input.conseillerLanguageOther,
      speciality: input.speciality,
      specialityOther: input.specialityOther,
      familiarity: input.familiarity,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.briefs.set(input.id, record);
    if (input.idempotencyKey) this.byIdempotency.set(input.idempotencyKey, input.id);
  }
  async markVerified(args: { briefId: VoyageurBriefId; verifiedAt: Date }): Promise<void> {
    const b = this.briefs.get(args.briefId);
    if (!b) throw new Error(`brief ${args.briefId} introuvable`);
    this.briefs.set(args.briefId, { ...b, status: 'active', verifiedAt: args.verifiedAt });
  }
  async updateStatus(args: Parameters<VoyageurBriefWriter['updateStatus']>[0]) {
    const b = this.briefs.get(args.briefId);
    if (!b) return;
    this.briefs.set(args.briefId, {
      ...b,
      status: args.status,
      erasureRequestedAt: args.erasureRequestedAt ?? b.erasureRequestedAt,
      anonymizedAt: args.anonymizedAt ?? b.anonymizedAt,
    });
  }

  // helpers de seed pour les tests
  seed(brief: VoyageurBriefRecord): void {
    this.briefs.set(brief.id, brief);
    if (brief.idempotencyKey) this.byIdempotency.set(brief.idempotencyKey, brief.id);
  }
}

// =====================================================================
// MagicLinkToken fake
// =====================================================================

export class FakeMagicLinkTokenStore implements MagicLinkTokenWriter {
  public tokens = new Map<MagicLinkTokenId, MagicLinkTokenRecord>();
  public byHash = new Map<string, MagicLinkTokenId>();

  async create(input: CreateTokenInput): Promise<void> {
    const record: MagicLinkTokenRecord = {
      id: input.id,
      briefId: input.briefId,
      tokenHash: input.tokenHash,
      purpose: input.purpose,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    };
    this.tokens.set(input.id, record);
    this.byHash.set(input.tokenHash, input.id);
  }
  async findByHash(tokenHash: string): Promise<MagicLinkTokenRecord | null> {
    const id = this.byHash.get(tokenHash);
    return id ? (this.tokens.get(id) ?? null) : null;
  }
  async markConsumed(args: { tokenId: MagicLinkTokenId; consumedAt: Date }): Promise<void> {
    const t = this.tokens.get(args.tokenId);
    if (!t) return;
    this.tokens.set(args.tokenId, { ...t, consumedAt: args.consumedAt });
  }
  async expirePendingByBrief() {
    return 0;
  }
}

// =====================================================================
// MagicLinkMailer fake — collecte les envois
// =====================================================================

export class FakeMagicLinkMailer implements MagicLinkMailer {
  public sent: Array<SendMagicLinkInput> = [];

  async send(input: SendMagicLinkInput): Promise<void> {
    this.sent.push(input);
  }
}

// =====================================================================
// DisposableEmailChecker fake — configurable
// =====================================================================

export class FakeDisposableEmailChecker implements DisposableEmailChecker {
  constructor(public disposableDomains: ReadonlyArray<string> = ['mailinator.com']) {}

  async isDisposable(email: string): Promise<boolean> {
    const domain = email.toLowerCase().split('@')[1] ?? '';
    return this.disposableDomains.includes(domain);
  }
}

// =====================================================================
// IntakeRateLimiter fake — verdict configurable
// =====================================================================

export class FakeIntakeRateLimiter implements IntakeRateLimiter {
  public nextOutcome: RateLimitOutcome = { allowed: true };
  public calls: Array<RateLimitInput> = [];

  async checkAndIncrement(input: RateLimitInput): Promise<RateLimitOutcome> {
    this.calls.push(input);
    return this.nextOutcome;
  }
}

// =====================================================================
// IntakeAuditLogWriter + IntakeOutboxWriter fakes
// =====================================================================

export class FakeIntakeAuditLogWriter implements IntakeAuditLogWriter {
  public entries: Array<IntakeAuditEntryInput> = [];
  async append(entry: IntakeAuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

export class FakeIntakeOutboxWriter implements IntakeOutboxWriter {
  public entries: Array<IntakeOutboxEntryInput> = [];
  async enqueue(entry: IntakeOutboxEntryInput): Promise<void> {
    this.entries.push(entry);
  }
}

// =====================================================================
// Helpers de typage pour les tests
// =====================================================================

export function asBriefId(uuid: string): VoyageurBriefId {
  return uuid as VoyageurBriefId;
}
export function asContactId(uuid: string): VoyageurContactId {
  return uuid as VoyageurContactId;
}
export function asTokenId(uuid: string): MagicLinkTokenId {
  return uuid as MagicLinkTokenId;
}
export function asAuditId(uuid: string): IntakeAuditEntryId {
  return uuid as IntakeAuditEntryId;
}
export function asOutboxId(uuid: string): IntakeOutboxEntryId {
  return uuid as IntakeOutboxEntryId;
}
