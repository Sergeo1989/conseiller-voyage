// T085 — PropagateExpirationsUseCase (US2 FR-009).
//
// Tourné quotidiennement après SendExpirationReminders. Pour chaque
// conseiller actuellement verified qui n'a plus AUCUN certificat valide
// (tous expirés ou refused), bascule sa compliance en `suspended` +
// audit + outbox.
//
// computeConformiteStatus fait le calcul ; isTransitionAllowed valide
// que verified → suspended est légal.

import type { ConseillerId } from '@cv/shared/conformite';
import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { ConseillerCompliance } from '../../domain/entities/conseiller-compliance.entity';
import { computeConformiteStatus } from '../../domain/services/compute-conformite-status';
import { isTransitionAllowed } from '../../domain/services/is-transition-allowed';
import type { AuditEntryToCreate } from '../ports/audit-log-writer.port';
import { CONFORMITE_READER, type ConformiteReader } from '../ports/conformite-reader.port';
import {
  CONFORMITE_STATUS_CACHE,
  type ConformiteStatusCache,
} from '../ports/conformite-status-cache.port';
import { CONFORMITE_WRITER, type ConformiteWriter } from '../ports/conformite-writer.port';
import type { OutboxEntryToCreate } from '../ports/outbox-writer.port';

export interface PropagateExpirationsInput {
  readonly asOf?: Date;
}

export interface PropagateExpirationsOutput {
  /** Nombre de conseillers basculés verified → suspended. */
  readonly suspendedCount: number;
}

@Injectable()
export class PropagateExpirationsUseCase {
  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(CONFORMITE_WRITER) private readonly writer: ConformiteWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuidGenerator: UuidGenerator,
    @Inject(CONFORMITE_STATUS_CACHE) private readonly cache: ConformiteStatusCache,
  ) {}

  async execute(input: PropagateExpirationsInput = {}): Promise<PropagateExpirationsOutput> {
    const now = input.asOf ?? this.clock.now();
    const verifieds = await this.reader.listVerifiedCompliances();
    const revocations = await this.reader.listPermitRevocations();

    let suspendedCount = 0;
    for (const compliance of verifieds) {
      const transitioned = await this.evaluate(compliance, revocations, now);
      if (transitioned) suspendedCount += 1;
    }

    return { suspendedCount };
  }

  private async evaluate(
    compliance: ConseillerCompliance,
    revocations: Awaited<ReturnType<ConformiteReader['listPermitRevocations']>>,
    now: Date,
  ): Promise<boolean> {
    const [certs, affils] = await Promise.all([
      this.reader.listCertificatsForCompliance(compliance.id),
      this.reader.listAffiliationsForCompliance(compliance.id),
    ]);

    const newStatus = computeConformiteStatus({
      currentStatus: compliance.status,
      certificats: certs,
      affiliations: affils,
      permitRevocations: revocations,
      now,
    });

    if (newStatus === compliance.status) return false;
    if (!isTransitionAllowed(compliance.status, newStatus)) return false;
    if (newStatus !== 'suspended') return false;

    const expiredIds = certs
      .filter((c) => c.decision === 'approved' && c.expiresAt <= now)
      .map((c) => c.id);

    const correlationId = this.uuidGenerator.generate();
    const auditEntry: AuditEntryToCreate = {
      conseillerComplianceId: compliance.id,
      eventType: 'expiration.auto_suspended',
      actorId: null,
      actorRole: 'system',
      payload: {
        expiredCertificateIds: expiredIds.length > 0 ? expiredIds : [certs[0]?.id ?? compliance.id],
      },
      idempotencyKey: `expiration:${compliance.id}:${now.toISOString().slice(0, 10)}`,
      correlationId,
    };

    const statusChangedAudit: AuditEntryToCreate = {
      conseillerComplianceId: compliance.id,
      eventType: 'status.changed_to_suspended',
      actorId: null,
      actorRole: 'system',
      payload: {
        previousStatus: compliance.status,
        newStatus,
        cause: 'certificate_expiration',
      },
      idempotencyKey: null,
      correlationId,
    };

    const outboxEntry: OutboxEntryToCreate = {
      id: this.uuidGenerator.generate(),
      eventType: 'conformite.status.changed',
      payload: {
        type: 'conformite.status.changed',
        conseillerId: compliance.conseillerId as ConseillerId,
        previousStatus: compliance.status,
        newStatus,
        transitionKind: 'negative',
        cause: 'certificate_expiration',
        occurredAt: now.toISOString(),
        correlationId,
      },
    };

    await this.writer.applyStatusTransition({
      transition: {
        conseillerComplianceId: compliance.id,
        from: compliance.status,
        to: newStatus,
        newLastVerifiedAt: compliance.lastVerifiedAt,
        transitionedAt: now,
      },
      auditEntries: [auditEntry, statusChangedAudit],
      outboxEntries: [outboxEntry],
    });

    // Synchronous cache invalidate (eng review issue 1.1 — FR-022 negative SLO).
    // Auto-suspension on expiration is a negative transition; closing the
    // in-process gap matters even though the job runs at 02:00 ca-central-1
    // (consumer caches must reflect the new state by morning).
    await this.cache.invalidate(compliance.conseillerId as ConseillerId);
    return true;
  }
}
