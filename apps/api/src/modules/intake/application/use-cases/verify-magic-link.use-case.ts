// T047 [TDD GREEN] — VerifyMagicLinkUseCase.
//
// Consomme un magic link clear, mark le token consommé, transition
// brief pending_verification → active, publish outbox
// 'voyageur.brief.activated' + audit 'intake.brief.verified'.

import type { IntakeAuditEntryId, IntakeOutboxEntryId, VoyageurBriefId } from '@cv/shared/intake';
import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import { hashToken } from '../../domain/entities/magic-link-token.entity';
import type {
  IntakeAuditLogWriter,
  IntakeOutboxWriter,
  MagicLinkTokenWriter,
  VoyageurBriefReader,
  VoyageurBriefWriter,
} from '../ports';

export interface VerifyMagicLinkInput {
  readonly clearToken: string;
}

export type VerifyMagicLinkResult =
  | { readonly kind: 'ok'; readonly briefId: VoyageurBriefId; readonly status: 'active' }
  | { readonly kind: 'token_not_found' }
  | { readonly kind: 'token_expired' }
  | { readonly kind: 'token_already_consumed' }
  | { readonly kind: 'brief_anonymised' };

export interface VerifyMagicLinkDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly briefReader: VoyageurBriefReader;
  readonly briefWriter: VoyageurBriefWriter;
  readonly tokenWriter: MagicLinkTokenWriter;
  readonly audit: IntakeAuditLogWriter;
  readonly outbox: IntakeOutboxWriter;
}

@Injectable()
export class VerifyMagicLinkUseCase {
  constructor(
    @Inject(VerifyMagicLinkUseCase.DEPS_TOKEN)
    private readonly deps: VerifyMagicLinkDeps,
  ) {}

  static readonly DEPS_TOKEN = Symbol.for('VerifyMagicLinkDeps');

  async execute(input: VerifyMagicLinkInput): Promise<VerifyMagicLinkResult> {
    const tokenHash = hashToken(input.clearToken);
    const token = await this.deps.tokenWriter.findByHash(tokenHash);
    if (!token) {
      return { kind: 'token_not_found' };
    }

    const now = this.deps.clock.now();
    if (token.consumedAt !== null) {
      return { kind: 'token_already_consumed' };
    }
    if (now >= token.expiresAt) {
      return { kind: 'token_expired' };
    }

    const brief = await this.deps.briefReader.findById(token.briefId);
    if (!brief) {
      return { kind: 'token_not_found' };
    }
    if (brief.status === 'anonymized') {
      return { kind: 'brief_anonymised' };
    }

    // Transition pending_verification → active.
    await this.deps.tokenWriter.markConsumed({ tokenId: token.id, consumedAt: now });
    await this.deps.briefWriter.markVerified({ briefId: brief.id, verifiedAt: now });

    // Audit append-only
    const auditId = this.deps.uuid.generate() as IntakeAuditEntryId;
    await this.deps.audit.append({
      id: auditId,
      voyageurBriefId: brief.id,
      voyageurContactId: brief.voyageurContactId,
      eventType: 'intake.brief.verified',
      actorRole: 'voyageur',
      actorId: null,
      occurredAt: now,
      payload: {
        speciality: brief.speciality,
        conseillerLanguage: brief.conseillerLanguage,
        budgetRange: brief.budgetRange,
      },
      idempotencyKey: null,
      correlationId: null,
    });

    // Outbox publish — voyageur.brief.activated consommé par matching (011).
    const outboxId = this.deps.uuid.generate() as IntakeOutboxEntryId;
    await this.deps.outbox.enqueue({
      id: outboxId,
      eventType: 'voyageur.brief.activated',
      payload: {
        briefId: brief.id,
        voyageurContactId: brief.voyageurContactId,
        speciality: brief.speciality,
        conseillerLanguage: brief.conseillerLanguage,
        conseillerLanguageOther: brief.conseillerLanguageOther,
        budgetRange: brief.budgetRange,
        destinations: brief.destinations,
        departureDate: brief.departureDate.toISOString(),
        returnDate: brief.returnDate.toISOString(),
        datesFlexible: brief.datesFlexible,
        datesFlexibilityDays: brief.datesFlexibilityDays,
        adultsCount: brief.adultsCount,
        childrenAges: brief.childrenAges,
        infantsCount: brief.infantsCount,
        speciality_other: brief.specialityOther,
        familiarity: brief.familiarity,
      },
    });

    return { kind: 'ok', briefId: brief.id, status: 'active' };
  }
}
