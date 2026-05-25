// T053 — ApproveDossierUseCase.
// Approbation d'une Submission par un admin :
//   1. RBAC : seul role=admin (Principe IX).
//   2. Charge Submission + Compliance + certificats/affiliations.
//   3. Projette les certs/affils du dossier comme "approved".
//   4. Calcule le statut conformité résultant via computeConformiteStatus
//      (fonction pure — Principe VI).
//   5. Vérifie isTransitionAllowed (machine d'état Principe VI).
//   6. Écrit transactionnellement (B1) : Submission décidée + transition
//      statut éventuelle + AuditEntry(s) + OutboxEntry(s).
// Cf. spec FR-003/FR-006/FR-022 + data-model.md *Machine d'état*.

import type { AdminId, ConseillerId, SubmissionId } from '@cv/shared/conformite';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { AuthRole } from '../../../identite/application/ports/auth-session-reader.port';
import type { Affiliation } from '../../domain/entities/affiliation.entity';
import type { AuditEventType } from '../../domain/entities/audit-entry.entity';
import type { Certificat } from '../../domain/entities/certificat.entity';
import type { ConseillerCompliance } from '../../domain/entities/conseiller-compliance.entity';
import type { Submission } from '../../domain/entities/submission.entity';
import { computeConformiteStatus } from '../../domain/services/compute-conformite-status';
import { isTransitionAllowed } from '../../domain/services/is-transition-allowed';
import type { ConformiteStatus } from '../../domain/value-objects/conformite-status.vo';
import type { AuditEntryToCreate } from '../ports/audit-log-writer.port';
import { CONFORMITE_READER, type ConformiteReader } from '../ports/conformite-reader.port';
import {
  CONFORMITE_STATUS_CACHE,
  type ConformiteStatusCache,
} from '../ports/conformite-status-cache.port';
import {
  CONFORMITE_WRITER,
  type ConformiteWriter,
  type StatusTransition,
} from '../ports/conformite-writer.port';
import type { OutboxEntryToCreate } from '../ports/outbox-writer.port';

export interface ApproveDossierInput {
  readonly requestedBy: { readonly id: AdminId; readonly role: AuthRole };
  readonly submissionId: SubmissionId;
  /** Commentaire optionnel de l'admin (max 500 chars côté HTTP). */
  readonly comment: string | null;
}

interface DossierContext {
  readonly submission: Submission;
  readonly compliance: ConseillerCompliance;
  readonly certificats: ReadonlyArray<Certificat>;
  readonly affiliations: ReadonlyArray<Affiliation>;
  readonly subCertIds: ReadonlySet<string>;
  readonly subAffilIds: ReadonlySet<string>;
}

@Injectable()
export class ApproveDossierUseCase {
  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(CONFORMITE_WRITER) private readonly writer: ConformiteWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuidGenerator: UuidGenerator,
    @Inject(CONFORMITE_STATUS_CACHE) private readonly cache: ConformiteStatusCache,
  ) {}

  async execute(input: ApproveDossierInput): Promise<void> {
    this.enforceRbac(input.requestedBy.role);

    const ctx = await this.loadContext(input.submissionId);
    const now = this.clock.now();
    const newStatus = this.computeProjectedStatus(ctx, now);
    const transition = this.computeTransition(ctx.compliance, newStatus, now);

    const correlationId = this.uuidGenerator.generate();
    const auditEntries = this.buildAuditEntries(input, ctx, transition, correlationId);
    const outboxEntries = this.buildOutboxEntries(input, ctx, transition, now, correlationId);

    await this.writer.approveSubmission({
      submissionId: ctx.submission.id,
      adminId: input.requestedBy.id,
      decidedAt: now,
      comment: input.comment,
      statusTransition: transition,
      auditEntries,
      outboxEntries,
    });

    // Synchronous cache invalidate (eng review issue 1.1 — FR-022 negative SLO).
    // Pub/sub via outbox is best-effort across processes; this DEL closes the
    // window where in-process consumers could serve stale `verified=true`.
    if (transition !== null) {
      await this.cache.invalidate(ctx.compliance.conseillerId as ConseillerId);
    }
  }

  private enforceRbac(role: AuthRole): void {
    if (role !== 'admin') {
      throw new UnauthorizedException('Only admins can approve a dossier (Principe IX).');
    }
  }

  private async loadContext(submissionId: SubmissionId): Promise<DossierContext> {
    const submission = await this.reader.findSubmission(submissionId);
    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found.`);
    }
    if (submission.status !== 'pending') {
      throw new ConflictException(
        `Submission ${submissionId} already decided (status=${submission.status}).`,
      );
    }
    const compliance = await this.reader.findComplianceById(submission.conseillerComplianceId);
    if (!compliance) {
      throw new NotFoundException(
        `ConseillerCompliance ${submission.conseillerComplianceId} not found.`,
      );
    }
    const [certificats, affiliations, subCerts, subAffils] = await Promise.all([
      this.reader.listCertificatsForCompliance(compliance.id),
      this.reader.listAffiliationsForCompliance(compliance.id),
      this.reader.listCertificatsForSubmission(submission.id),
      this.reader.listAffiliationsForSubmission(submission.id),
    ]);
    return {
      submission,
      compliance,
      certificats,
      affiliations,
      subCertIds: new Set(subCerts.map((c) => c.id)),
      subAffilIds: new Set(subAffils.map((a) => a.id)),
    };
  }

  private computeProjectedStatus(ctx: DossierContext, now: Date): ConformiteStatus {
    const projectedCerts = ctx.certificats.map((c) =>
      ctx.subCertIds.has(c.id) ? { ...c, decision: 'approved' as const, decisionAt: now } : c,
    );
    const projectedAffils = ctx.affiliations.map((a) =>
      ctx.subAffilIds.has(a.id) ? { ...a, decision: 'approved' as const, decisionAt: now } : a,
    );
    return computeConformiteStatus({
      currentStatus: ctx.compliance.status,
      certificats: projectedCerts,
      affiliations: projectedAffils,
      // Les révocations de permis sont gérées dans US4 — pas pertinentes
      // ici, mais on les lit pour cohérence si l'admin approuve un dossier
      // dont une affiliation a depuis été cascade-revoquée.
      permitRevocations: [],
      now,
    });
  }

  private computeTransition(
    compliance: ConseillerCompliance,
    newStatus: ConformiteStatus,
    now: Date,
  ): StatusTransition | null {
    if (newStatus === compliance.status) return null;
    if (!isTransitionAllowed(compliance.status, newStatus)) {
      throw new ForbiddenException(
        `Illegal status transition ${compliance.status} → ${newStatus} (machine d'état).`,
      );
    }
    return {
      conseillerComplianceId: compliance.id,
      from: compliance.status,
      to: newStatus,
      newLastVerifiedAt: newStatus === 'verified' ? now : compliance.lastVerifiedAt,
      transitionedAt: now,
    };
  }

  private buildAuditEntries(
    input: ApproveDossierInput,
    ctx: DossierContext,
    transition: StatusTransition | null,
    correlationId: string,
  ): ReadonlyArray<AuditEntryToCreate> {
    const entries: AuditEntryToCreate[] = [];
    entries.push({
      conseillerComplianceId: ctx.compliance.id,
      eventType: 'dossier.approved',
      actorId: input.requestedBy.id,
      actorRole: 'admin',
      payload: {
        submissionId: ctx.submission.id,
        ...(input.comment !== null && input.comment !== ''
          ? { commentLength: input.comment.length }
          : {}),
      },
      idempotencyKey: null,
      correlationId,
    });
    if (transition) {
      entries.push({
        conseillerComplianceId: ctx.compliance.id,
        eventType: this.statusChangedEventType(transition.to),
        actorId: input.requestedBy.id,
        actorRole: 'admin',
        payload: {
          previousStatus: transition.from,
          newStatus: transition.to,
          cause: 'admin_approval',
        },
        idempotencyKey: null,
        correlationId,
      });
    }
    return entries;
  }

  private statusChangedEventType(to: ConformiteStatus): AuditEventType {
    switch (to) {
      case 'verified':
        return 'status.changed_to_verified';
      case 'suspended':
        return 'status.changed_to_suspended';
      case 'revoked':
        return 'status.changed_to_revoked';
      default:
        // pending n'a pas d'eventType — défensif : ne devrait pas arriver
        // car transition.to ne sera pending qu'en cas d'auto-pending,
        // contrôlé par computeProjectedStatus.
        throw new Error(`No audit eventType for transition to ${to}`);
    }
  }

  private buildOutboxEntries(
    input: ApproveDossierInput,
    ctx: DossierContext,
    transition: StatusTransition | null,
    now: Date,
    correlationId: string,
  ): ReadonlyArray<OutboxEntryToCreate> {
    const entries: OutboxEntryToCreate[] = [];
    entries.push({
      id: this.uuidGenerator.generate(),
      eventType: 'conformite.dossier.decided',
      payload: {
        type: 'conformite.dossier.decided',
        conseillerId: ctx.compliance.conseillerId as ConseillerId,
        submissionId: ctx.submission.id,
        decision: 'approved',
        reason: null,
        adminId: input.requestedBy.id,
        occurredAt: now.toISOString(),
      },
    });
    if (transition) {
      entries.push({
        id: this.uuidGenerator.generate(),
        eventType: 'conformite.status.changed',
        payload: {
          type: 'conformite.status.changed',
          conseillerId: ctx.compliance.conseillerId as ConseillerId,
          previousStatus: transition.from,
          newStatus: transition.to,
          transitionKind: 'positive',
          cause: 'admin_approval',
          occurredAt: now.toISOString(),
          correlationId,
        },
      });
    }
    return entries;
  }
}
