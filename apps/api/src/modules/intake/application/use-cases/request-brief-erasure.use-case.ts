// T104 [TDD GREEN] — RequestBriefErasureUseCase (FR-022).
//
// Effacement d'UN brief précis (Q4 default). Le contact + autres briefs
// persistent. Synchrone et atomique pour garantir SC-008 (< 60s).

import {
  ERASURE_BRIEF_PHRASE,
  type IntakeAuditEntryId,
  type IntakeOutboxEntryId,
  type VoyageurBriefId,
  type VoyageurContactId,
} from '@cv/shared/intake';
import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type {
  IntakeAuditLogWriter,
  IntakeOutboxWriter,
  VoyageurBriefReader,
  VoyageurBriefWriter,
  VoyageurNotificationOutbox,
} from '../ports';

export interface RequestBriefErasureInput {
  readonly briefId: VoyageurBriefId;
  readonly contactId: VoyageurContactId;
  readonly confirmation: string;
}

export type RequestBriefErasureResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'invalid_confirmation' }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'already_deleted' };

export interface RequestBriefErasureDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly briefReader: VoyageurBriefReader;
  readonly briefWriter: VoyageurBriefWriter;
  readonly audit: IntakeAuditLogWriter;
  readonly outbox: IntakeOutboxWriter;
  /** Optionnel (017 FR-010) — annule les notifications voyageur en attente. */
  readonly voyageurNotificationOutbox?: VoyageurNotificationOutbox;
}

@Injectable()
export class RequestBriefErasureUseCase {
  constructor(
    @Inject(RequestBriefErasureUseCase.DEPS_TOKEN)
    private readonly deps: RequestBriefErasureDeps,
  ) {}

  static readonly DEPS_TOKEN = Symbol.for('RequestBriefErasureDeps');

  async execute(input: RequestBriefErasureInput): Promise<RequestBriefErasureResult> {
    if (input.confirmation !== ERASURE_BRIEF_PHRASE) {
      return { kind: 'invalid_confirmation' };
    }

    const brief = await this.deps.briefReader.findById(input.briefId);
    if (!brief) return { kind: 'not_found' };
    if (brief.voyageurContactId !== input.contactId) return { kind: 'unauthorized' };
    if (brief.status === 'anonymized') return { kind: 'already_deleted' };

    const now = this.deps.clock.now();
    await this.deps.briefWriter.updateStatus({
      briefId: input.briefId,
      status: 'anonymized',
      erasureRequestedAt: now,
      anonymizedAt: now,
    });

    await this.deps.audit.append({
      id: this.deps.uuid.generate() as IntakeAuditEntryId,
      voyageurBriefId: input.briefId,
      voyageurContactId: input.contactId,
      eventType: 'intake.brief.erasure_requested',
      actorRole: 'voyageur',
      actorId: null,
      occurredAt: now,
      payload: {
        triggeredFlow: 'brief_only',
      },
      idempotencyKey: null,
      correlationId: null,
    });

    await this.deps.outbox.enqueue({
      id: this.deps.uuid.generate() as IntakeOutboxEntryId,
      eventType: 'voyageur.brief.deleted',
      payload: {
        briefId: input.briefId,
        deletedAt: now.toISOString(),
        reason: 'voyageur_request',
      },
    });

    // Loi 25 (FR-010) : un brief effacé ne déclenche plus de notification ; on
    // annule celles en attente. Best-effort — l'effacement reste effectif.
    if (this.deps.voyageurNotificationOutbox) {
      try {
        await this.deps.voyageurNotificationOutbox.cancelPendingForBrief(input.briefId);
      } catch {
        // best-effort
      }
    }

    return { kind: 'ok' };
  }
}
