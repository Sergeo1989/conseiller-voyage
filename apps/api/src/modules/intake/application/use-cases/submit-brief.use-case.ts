// T045 [TDD GREEN] — SubmitBriefUseCase.
//
// Orchestre la soumission d'un brief voyageur (FR-001 à FR-013) :
//   1. Validation Zod (SubmitBriefSchema)
//   2. Domain rule (validateBriefSubmission — pas de date passée etc.)
//   3. Idempotency lookup
//   4. DisposableEmailChecker (FR-021)
//   5. IntakeRateLimiter (FR-019/020/020a)
//   6. UpsertContactByEmail (un contact par email, multi-briefs)
//   7. Create VoyageurBrief en pending_verification
//   8. Generate random clear token + hash + create MagicLinkToken
//   9. Enqueue mailer (FR-013a — SES retry géré côté adapter)
//   10. Append IntakeAuditEntry 'intake.brief.submitted'
//
// Retour discriminé `SubmitBriefResult` consommable par le controller.

import { type SubmitBriefPayload, SubmitBriefSchema } from '@cv/shared/intake';
import type {
  IntakeAuditEntryId,
  MagicLinkTokenId,
  VoyageurBriefId,
  VoyageurContactId,
} from '@cv/shared/intake';
import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import { generateClearToken, hashToken } from '../../domain/entities/magic-link-token.entity';
import { computeBriefExpiration } from '../../domain/services/compute-brief-expiration';
import { validateBriefSubmission } from '../../domain/services/validate-brief-submission';
import type {
  DisposableEmailChecker,
  IntakeAuditLogWriter,
  IntakeOutboxWriter,
  IntakeRateLimiter,
  MagicLinkMailer,
  MagicLinkTokenWriter,
  VoyageurBriefReader,
  VoyageurBriefWriter,
  VoyageurContactReader,
  VoyageurContactWriter,
} from '../ports';

// =====================================================================
// Input + result discriminated union
// =====================================================================

export interface SubmitBriefInput extends SubmitBriefPayload {
  readonly locale: 'fr-CA' | 'en';
  readonly clientIp: string | null;
  readonly userAgent: string | null;
  readonly idempotencyKey: string | null;
}

export type SubmitBriefResult =
  | { readonly kind: 'ok'; readonly briefId: VoyageurBriefId; readonly emailSent: boolean }
  | {
      readonly kind: 'validation_failed';
      readonly issues: ReadonlyArray<{ path: string; message: string }>;
    }
  | {
      readonly kind: 'rate_limited';
      readonly reason: 'email' | 'ip';
      readonly retryAfterSeconds: number;
    }
  | { readonly kind: 'disposable_email' }
  | { readonly kind: 'business_rule_failed'; readonly message: string };

// =====================================================================
// DI deps
// =====================================================================

export interface SubmitBriefDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly contactReader: VoyageurContactReader;
  readonly contactWriter: VoyageurContactWriter;
  readonly briefReader: VoyageurBriefReader;
  readonly briefWriter: VoyageurBriefWriter;
  readonly tokenWriter: MagicLinkTokenWriter;
  readonly mailer: MagicLinkMailer;
  readonly disposableEmailChecker: DisposableEmailChecker;
  readonly rateLimiter: IntakeRateLimiter;
  readonly audit: IntakeAuditLogWriter;
  readonly outbox: IntakeOutboxWriter;
  readonly magicLinkSecret: string;
  readonly expirationDays: number;
  readonly magicLinkTtlDays: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type PreCheckResult =
  | { readonly kind: 'continue'; readonly data: SubmitBriefPayload }
  | Exclude<SubmitBriefResult, { kind: 'ok' }>
  | { readonly kind: 'idempotent_hit'; readonly briefId: VoyageurBriefId };

@Injectable()
export class SubmitBriefUseCase {
  constructor(
    @Inject(SubmitBriefUseCase.DEPS_TOKEN)
    private readonly deps: SubmitBriefDeps,
  ) {}

  static readonly DEPS_TOKEN = Symbol.for('SubmitBriefDeps');

  async execute(rawInput: SubmitBriefInput): Promise<SubmitBriefResult> {
    const pre = await this.runPreChecks(rawInput);
    if (pre.kind === 'idempotent_hit') {
      return { kind: 'ok', briefId: pre.briefId, emailSent: true };
    }
    if (pre.kind !== 'continue') {
      return pre;
    }

    const data = pre.data;
    const contactId = await this.upsertContact(data);
    const now = this.deps.clock.now();
    const briefId = await this.createBrief(rawInput, data, contactId, now);
    const emailSent = await this.issueMagicLink(rawInput, data, briefId, now);
    await this.appendSubmittedAudit(rawInput, data, briefId, contactId, now, emailSent);

    return { kind: 'ok', briefId, emailSent };
  }

  // ---------------------------------------------------------------------
  // Étapes 1-5 : pré-validation + checks anti-abus
  // ---------------------------------------------------------------------
  private async runPreChecks(rawInput: SubmitBriefInput): Promise<PreCheckResult> {
    const parsed = SubmitBriefSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        kind: 'validation_failed',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      };
    }
    const data = parsed.data;

    try {
      validateBriefSubmission({
        departureDate: new Date(data.departureDate),
        returnDate: new Date(data.returnDate),
        destinations: data.destinations,
        adultsCount: data.adultsCount,
        childrenAges: data.childrenAges,
        infantsCount: data.infantsCount,
        now: this.deps.clock.now(),
      });
    } catch (err) {
      return {
        kind: 'business_rule_failed',
        message: err instanceof Error ? err.message : 'Brief invalide',
      };
    }

    if (rawInput.idempotencyKey) {
      const existing = await this.deps.briefReader.findByIdempotencyKey(rawInput.idempotencyKey);
      if (existing) {
        return { kind: 'idempotent_hit', briefId: existing.id };
      }
    }

    if (await this.deps.disposableEmailChecker.isDisposable(data.contact.email)) {
      return { kind: 'disposable_email' };
    }

    const decision = await this.deps.rateLimiter.checkAndIncrement({
      email: data.contact.email,
      clientIp: rawInput.clientIp,
      nowMs: this.deps.clock.nowMs(),
    });
    if (decision.allowed === false) {
      return {
        kind: 'rate_limited',
        reason: decision.reason,
        retryAfterSeconds: decision.retryAfterSeconds,
      };
    }

    return { kind: 'continue', data };
  }

  // ---------------------------------------------------------------------
  // Étape 6 : upsert contact
  // ---------------------------------------------------------------------
  private async upsertContact(data: SubmitBriefPayload): Promise<VoyageurContactId> {
    const tentativeId = this.deps.uuid.generate() as VoyageurContactId;
    return this.deps.contactWriter.upsertByEmail({
      id: tentativeId,
      email: data.contact.email,
      firstName: data.contact.firstName,
      lastName: data.contact.lastName,
      phone: data.contact.phone ?? null,
      postalCode: data.contact.postalCode ?? null,
    });
  }

  // ---------------------------------------------------------------------
  // Étape 7 : create brief
  // ---------------------------------------------------------------------
  private async createBrief(
    rawInput: SubmitBriefInput,
    data: SubmitBriefPayload,
    contactId: VoyageurContactId,
    now: Date,
  ): Promise<VoyageurBriefId> {
    const briefId = this.deps.uuid.generate() as VoyageurBriefId;
    const expiresAt = computeBriefExpiration({
      submittedAt: now,
      expirationDays: this.deps.expirationDays,
    });
    await this.deps.briefWriter.create({
      id: briefId,
      voyageurContactId: contactId,
      expiresAt,
      consentGivenAt: now,
      destinations: data.destinations,
      departureDate: new Date(data.departureDate),
      returnDate: new Date(data.returnDate),
      datesFlexible: data.datesFlexible,
      datesFlexibilityDays: data.datesFlexibilityDays ?? null,
      adultsCount: data.adultsCount,
      childrenAges: data.childrenAges,
      infantsCount: data.infantsCount,
      budgetRange: data.budgetRange,
      budgetNote: data.budgetNote ?? null,
      conseillerLanguage: data.conseillerLanguage,
      conseillerLanguageOther: data.conseillerLanguageOther ?? null,
      speciality: data.speciality,
      specialityOther: data.specialityOther ?? null,
      familiarity: data.familiarity,
      clientIp: rawInput.clientIp,
      userAgent: rawInput.userAgent,
      idempotencyKey: rawInput.idempotencyKey,
    });
    return briefId;
  }

  // ---------------------------------------------------------------------
  // Étapes 8-9 : magic link token + mailer
  // ---------------------------------------------------------------------
  private async issueMagicLink(
    rawInput: SubmitBriefInput,
    data: SubmitBriefPayload,
    briefId: VoyageurBriefId,
    now: Date,
  ): Promise<boolean> {
    const clearToken = generateClearToken();
    const tokenHash = hashToken(clearToken);
    const tokenId = this.deps.uuid.generate() as MagicLinkTokenId;
    const tokenExpiresAt = new Date(now.getTime() + this.deps.magicLinkTtlDays * MS_PER_DAY);

    await this.deps.tokenWriter.create({
      id: tokenId,
      briefId,
      tokenHash,
      purpose: 'verify_email',
      expiresAt: tokenExpiresAt,
    });

    try {
      await this.deps.mailer.send({
        briefId,
        toEmail: data.contact.email,
        firstName: data.contact.firstName,
        clearToken,
        locale: rawInput.locale,
      });
      return true;
    } catch {
      // L'adapter SES (T053) capture l'exception et enqueue le job retry
      // (FR-013a). Si on arrive ici, le brief reste créé en
      // pending_verification, le voyageur verra la page email-envoyé avec
      // mention "léger délai possible".
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // Étape 10 : audit append-only
  // ---------------------------------------------------------------------
  private async appendSubmittedAudit(
    rawInput: SubmitBriefInput,
    data: SubmitBriefPayload,
    briefId: VoyageurBriefId,
    contactId: VoyageurContactId,
    now: Date,
    emailSent: boolean,
  ): Promise<void> {
    const auditId = this.deps.uuid.generate() as IntakeAuditEntryId;
    await this.deps.audit.append({
      id: auditId,
      voyageurBriefId: briefId,
      voyageurContactId: contactId,
      eventType: 'intake.brief.submitted',
      actorRole: 'voyageur',
      actorId: null,
      occurredAt: now,
      payload: {
        speciality: data.speciality,
        conseillerLanguage: data.conseillerLanguage,
        budgetRange: data.budgetRange,
        emailSent,
        // pas d'email/firstName/lastName dans l'audit (pseudonymisation R10).
      },
      idempotencyKey: rawInput.idempotencyKey,
      correlationId: null,
    });
  }
}
