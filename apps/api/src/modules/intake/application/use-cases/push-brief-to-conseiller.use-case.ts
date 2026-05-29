// T119 [TDD GREEN] — PushBriefToConseillerUseCase (FR-027, US5 admin).
//
// Push manuel d'un brief vers un conseiller vérifié. Le contrôle de
// vérification passe par ConformiteQueryPort (cross-module via la
// facade publique 001).

import type { ConformiteQueryPort } from '@cv/shared/conformite';
import type { IntakeAuditEntryId, IntakeOutboxEntryId, VoyageurBriefId } from '@cv/shared/intake';
import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { IntakeAuditLogWriter, IntakeOutboxWriter, VoyageurBriefReader } from '../ports';

const MIN_REASON_CHARS = 20;
const MAX_REASON_CHARS = 500;

export interface PushBriefToConseillerInput {
  readonly briefId: VoyageurBriefId;
  readonly conseillerComplianceId: string;
  readonly reason: string;
  readonly adminUserId: string;
  readonly idempotencyKey: string | null;
}

export type PushBriefToConseillerResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'invalid_reason' }
  | { readonly kind: 'brief_not_found' }
  | { readonly kind: 'brief_anonymized' }
  | { readonly kind: 'conseiller_not_verified' };

export interface PushBriefToConseillerDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly briefReader: VoyageurBriefReader;
  readonly conformiteQuery: ConformiteQueryPort;
  readonly audit: IntakeAuditLogWriter;
  readonly outbox: IntakeOutboxWriter;
}

@Injectable()
export class PushBriefToConseillerUseCase {
  constructor(
    @Inject(PushBriefToConseillerUseCase.DEPS_TOKEN)
    private readonly deps: PushBriefToConseillerDeps,
  ) {}

  static readonly DEPS_TOKEN = Symbol.for('PushBriefToConseillerDeps');

  async execute(input: PushBriefToConseillerInput): Promise<PushBriefToConseillerResult> {
    if (input.reason.length < MIN_REASON_CHARS || input.reason.length > MAX_REASON_CHARS) {
      return { kind: 'invalid_reason' };
    }
    const brief = await this.deps.briefReader.findById(input.briefId);
    if (!brief) return { kind: 'brief_not_found' };
    if (brief.status === 'anonymized') return { kind: 'brief_anonymized' };

    const verification = await this.deps.conformiteQuery.getVerificationStatus({
      conseillerId: input.conseillerComplianceId,
      strict: true,
    });
    if (!verification.verified) return { kind: 'conseiller_not_verified' };

    const now = this.deps.clock.now();
    const correlationId = this.deps.uuid.generate();

    await this.deps.audit.append({
      id: this.deps.uuid.generate() as IntakeAuditEntryId,
      voyageurBriefId: input.briefId,
      voyageurContactId: brief.voyageurContactId,
      eventType: 'intake.admin.pushed_manual',
      actorRole: 'admin',
      actorId: input.adminUserId,
      occurredAt: now,
      payload: {
        conseillerComplianceId: input.conseillerComplianceId,
        reason: input.reason,
      },
      idempotencyKey: input.idempotencyKey,
      correlationId,
    });

    await this.deps.outbox.enqueue({
      id: this.deps.uuid.generate() as IntakeOutboxEntryId,
      eventType: 'voyageur.brief.pushed_manual',
      payload: {
        briefId: input.briefId,
        conseillerComplianceId: input.conseillerComplianceId,
        adminActorId: input.adminUserId,
        reason: input.reason,
        correlationId,
        pushedAt: now.toISOString(),
      },
    });

    return { kind: 'ok' };
  }
}
