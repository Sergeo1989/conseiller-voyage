// T115b [TDD GREEN] — EraseAllVoyageurDataUseCase (FR-022a, C1, Q4).
//
// Effacement GLOBAL : contact + tous ses briefs en une opération.
// Synchrone et atomique côté code ; le trigger SQL T015 garantit
// l'idempotence DB.

import { createHash } from 'node:crypto';
import {
  ERASURE_ALL_PHRASE,
  type IntakeAuditEntryId,
  type IntakeOutboxEntryId,
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
  VoyageurContactReader,
  VoyageurContactWriter,
} from '../ports';

export interface EraseAllVoyageurDataInput {
  readonly contactId: VoyageurContactId;
  readonly confirmation: string;
  readonly acknowledgedBriefCount: number;
}

export type EraseAllVoyageurDataResult =
  | { readonly kind: 'ok'; readonly briefsAffectedCount: number }
  | { readonly kind: 'invalid_confirmation' }
  | { readonly kind: 'stale_brief_count'; readonly actualCount: number }
  | { readonly kind: 'contact_not_found' }
  | { readonly kind: 'already_deleted' };

export interface EraseAllVoyageurDataDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly contactReader: VoyageurContactReader;
  readonly contactWriter: VoyageurContactWriter;
  readonly briefReader: VoyageurBriefReader;
  readonly briefWriter: VoyageurBriefWriter;
  readonly audit: IntakeAuditLogWriter;
  readonly outbox: IntakeOutboxWriter;
}

@Injectable()
export class EraseAllVoyageurDataUseCase {
  constructor(
    @Inject(EraseAllVoyageurDataUseCase.DEPS_TOKEN)
    private readonly deps: EraseAllVoyageurDataDeps,
  ) {}

  static readonly DEPS_TOKEN = Symbol.for('EraseAllVoyageurDataDeps');

  async execute(input: EraseAllVoyageurDataInput): Promise<EraseAllVoyageurDataResult> {
    if (input.confirmation !== ERASURE_ALL_PHRASE) {
      return { kind: 'invalid_confirmation' };
    }

    const contact = await this.deps.contactReader.findById(input.contactId);
    if (!contact) return { kind: 'contact_not_found' };
    if (contact.anonymizedAt !== null) return { kind: 'already_deleted' };

    const briefs = await this.deps.briefReader.listActiveByContactId(input.contactId);
    if (briefs.length !== input.acknowledgedBriefCount) {
      return { kind: 'stale_brief_count', actualCount: briefs.length };
    }

    const now = this.deps.clock.now();

    // 1. Cascade anonymisation tous les briefs actifs
    for (const brief of briefs) {
      await this.deps.briefWriter.updateStatus({
        briefId: brief.id,
        status: 'anonymized',
        erasureRequestedAt: now,
        anonymizedAt: now,
      });
      await this.deps.outbox.enqueue({
        id: this.deps.uuid.generate() as IntakeOutboxEntryId,
        eventType: 'voyageur.brief.deleted',
        payload: {
          briefId: brief.id,
          deletedAt: now.toISOString(),
          reason: 'voyageur_request',
          erasureFlow: 'global',
        },
      });
    }

    // 2. Anonymisation contact (PII nullified + emailHashAfterErasure)
    const emailHash =
      contact.email !== null
        ? createHash('sha256').update(contact.email.toLowerCase()).digest('hex')
        : '';
    await this.deps.contactWriter.applyAnonymisation({
      contactId: input.contactId,
      emailHashAfterErasure: emailHash,
      anonymizedAt: now,
    });

    // 3. Audit append-only
    await this.deps.audit.append({
      id: this.deps.uuid.generate() as IntakeAuditEntryId,
      voyageurBriefId: null,
      voyageurContactId: input.contactId,
      eventType: 'intake.contact.erase_all_requested',
      actorRole: 'voyageur',
      actorId: null,
      occurredAt: now,
      payload: {
        briefsAffectedCount: briefs.length,
      },
      idempotencyKey: null,
      correlationId: null,
    });

    return { kind: 'ok', briefsAffectedCount: briefs.length };
  }
}
