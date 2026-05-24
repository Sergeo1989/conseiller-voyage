// T055 — RefuseDossierUseCase.
// Refus d'une Submission par un admin :
//   1. RBAC : seul role=admin (Principe IX).
//   2. Validation : reason ≥ 20 chars (FR-004 — motif explicite obligatoire).
//   3. Charge Submission + Compliance.
//   4. Écrit transactionnellement (B1) : Submission décidée 'refused' +
//      AuditEntry + OutboxEntry. **Aucune** transition de statut conformité :
//      pending→pending est implicite (le conseiller peut re-soumettre).
// Cf. spec FR-003/FR-004 + data-model.md *Machine d'état*.

import type { AdminId, ConseillerId, SubmissionId } from '@cv/shared/conformite';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { AuthRole } from '../../../identite/application/ports/auth-session-reader.port';
import type { ConseillerCompliance } from '../../domain/entities/conseiller-compliance.entity';
import type { Submission } from '../../domain/entities/submission.entity';
import type { AuditEntryToCreate } from '../ports/audit-log-writer.port';
import { CONFORMITE_READER, type ConformiteReader } from '../ports/conformite-reader.port';
import { CONFORMITE_WRITER, type ConformiteWriter } from '../ports/conformite-writer.port';
import type { OutboxEntryToCreate } from '../ports/outbox-writer.port';

/** FR-004 : motif d'au moins 20 caractères. */
export const MIN_REFUSAL_REASON_LENGTH = 20;

export interface RefuseDossierInput {
  readonly requestedBy: { readonly id: AdminId; readonly role: AuthRole };
  readonly submissionId: SubmissionId;
  readonly reason: string;
}

@Injectable()
export class RefuseDossierUseCase {
  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(CONFORMITE_WRITER) private readonly writer: ConformiteWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuidGenerator: UuidGenerator,
  ) {}

  async execute(input: RefuseDossierInput): Promise<void> {
    this.enforceRbac(input.requestedBy.role);
    const reason = this.validateReason(input.reason);

    const submission = await this.loadPendingSubmission(input.submissionId);
    const compliance = await this.loadCompliance(submission);

    const now = this.clock.now();
    const correlationId = this.uuidGenerator.generate();

    const auditEntries = this.buildAuditEntries(
      input,
      submission,
      compliance,
      reason,
      correlationId,
    );
    const outboxEntries = this.buildOutboxEntries(input, submission, compliance, reason, now);

    await this.writer.refuseSubmission({
      submissionId: submission.id,
      adminId: input.requestedBy.id,
      decidedAt: now,
      reason,
      auditEntries,
      outboxEntries,
    });
  }

  private enforceRbac(role: AuthRole): void {
    if (role !== 'admin') {
      throw new UnauthorizedException('Only admins can refuse a dossier (Principe IX).');
    }
  }

  private validateReason(rawReason: string): string {
    const trimmed = rawReason.trim();
    if (trimmed.length < MIN_REFUSAL_REASON_LENGTH) {
      throw new BadRequestException(
        `Refusal reason must be at least ${MIN_REFUSAL_REASON_LENGTH} characters (FR-004).`,
      );
    }
    return trimmed;
  }

  private async loadPendingSubmission(submissionId: SubmissionId): Promise<Submission> {
    const submission = await this.reader.findSubmission(submissionId);
    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found.`);
    }
    if (submission.status !== 'pending') {
      throw new ConflictException(
        `Submission ${submissionId} already decided (status=${submission.status}).`,
      );
    }
    return submission;
  }

  private async loadCompliance(submission: Submission): Promise<ConseillerCompliance> {
    const compliance = await this.reader.findComplianceById(submission.conseillerComplianceId);
    if (!compliance) {
      throw new NotFoundException(
        `ConseillerCompliance ${submission.conseillerComplianceId} not found.`,
      );
    }
    return compliance;
  }

  private buildAuditEntries(
    input: RefuseDossierInput,
    submission: Submission,
    compliance: ConseillerCompliance,
    reason: string,
    correlationId: string,
  ): ReadonlyArray<AuditEntryToCreate> {
    return [
      {
        conseillerComplianceId: compliance.id,
        eventType: 'dossier.refused',
        actorId: input.requestedBy.id,
        actorRole: 'admin',
        payload: {
          submissionId: submission.id,
          // R10 : longueur uniquement, contenu en colonne decisionReason.
          reasonLength: reason.length,
        },
        idempotencyKey: null,
        correlationId,
      },
    ];
  }

  private buildOutboxEntries(
    input: RefuseDossierInput,
    submission: Submission,
    compliance: ConseillerCompliance,
    reason: string,
    now: Date,
  ): ReadonlyArray<OutboxEntryToCreate> {
    return [
      {
        id: this.uuidGenerator.generate(),
        eventType: 'conformite.dossier.decided',
        payload: {
          type: 'conformite.dossier.decided',
          conseillerId: compliance.conseillerId as ConseillerId,
          submissionId: submission.id,
          decision: 'refused',
          reason,
          adminId: input.requestedBy.id,
          occurredAt: now.toISOString(),
        },
      },
    ];
  }
}
