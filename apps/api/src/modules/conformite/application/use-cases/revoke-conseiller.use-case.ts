// T103 — RevokeConseillerUseCase (US4 FR-010).
//
// Révocation manuelle d'un conseiller par un admin :
//   - RBAC : admin only
//   - Motif obligatoire ≥ 20 chars (FR-004 — même règle que refus)
//   - Transitions autorisées : verified→revoked OU suspended→revoked
//   - Status final (sticky) ; un conseiller révoqué doit re-soumettre
//     un dossier complet pour repasser à pending (US4 acceptance #2)
//   - Émet AuditEntry status.changed_to_revoked + OutboxEntry
//     conformite.status.changed (cause=admin_revocation, négative)

import type { ConseillerId } from '@cv/shared/conformite';
import { AdminIdSchema, ConseillerComplianceIdSchema } from '@cv/shared/conformite';
import {
  BadRequestException,
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
import { isTransitionAllowed } from '../../domain/services/is-transition-allowed';
import type { AuditEntryToCreate } from '../ports/audit-log-writer.port';
import { CONFORMITE_READER, type ConformiteReader } from '../ports/conformite-reader.port';
import {
  CONFORMITE_STATUS_CACHE,
  type ConformiteStatusCache,
} from '../ports/conformite-status-cache.port';
import { CONFORMITE_WRITER, type ConformiteWriter } from '../ports/conformite-writer.port';
import type { OutboxEntryToCreate } from '../ports/outbox-writer.port';

const MIN_REASON_LENGTH = 20;
const MAX_REASON_LENGTH = 2000;

export interface RevokeConseillerInput {
  readonly requestedBy: { readonly id: string; readonly role: AuthRole };
  readonly conseillerComplianceId: string;
  readonly reason: string;
}

@Injectable()
export class RevokeConseillerUseCase {
  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(CONFORMITE_WRITER) private readonly writer: ConformiteWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuidGenerator: UuidGenerator,
    @Inject(CONFORMITE_STATUS_CACHE) private readonly cache: ConformiteStatusCache,
  ) {}

  async execute(input: RevokeConseillerInput): Promise<void> {
    this.enforceRbac(input.requestedBy.role);
    const adminId = AdminIdSchema.parse(input.requestedBy.id);
    const reason = this.validateReason(input.reason);
    const complianceId = ConseillerComplianceIdSchema.parse(input.conseillerComplianceId);

    const compliance = await this.reader.findComplianceById(complianceId);
    if (!compliance) {
      throw new NotFoundException(`Compliance ${complianceId} introuvable.`);
    }
    if (compliance.status === 'revoked') {
      throw new ConflictException('Le conseiller est déjà révoqué (état final).');
    }
    if (!isTransitionAllowed(compliance.status, 'revoked')) {
      throw new ForbiddenException(`Transition ${compliance.status} → revoked non autorisée.`);
    }

    const now = this.clock.now();
    const correlationId = this.uuidGenerator.generate();

    const auditEntries: AuditEntryToCreate[] = [
      {
        conseillerComplianceId: complianceId,
        eventType: 'status.changed_to_revoked',
        actorId: adminId,
        actorRole: 'admin',
        payload: {
          previousStatus: compliance.status,
          newStatus: 'revoked',
          cause: 'admin_revocation',
        },
        idempotencyKey: null,
        correlationId,
      },
    ];

    const outboxEntries: OutboxEntryToCreate[] = [
      {
        id: this.uuidGenerator.generate(),
        eventType: 'conformite.status.changed',
        payload: {
          type: 'conformite.status.changed',
          conseillerId: compliance.conseillerId as ConseillerId,
          previousStatus: compliance.status,
          newStatus: 'revoked',
          transitionKind: 'negative',
          cause: 'admin_revocation',
          reason, // exposé aux consommateurs notification pour template email
          adminId,
          occurredAt: now.toISOString(),
          correlationId,
        },
      },
    ];

    await this.writer.applyStatusTransition({
      transition: {
        conseillerComplianceId: complianceId,
        from: compliance.status,
        to: 'revoked',
        newLastVerifiedAt: compliance.lastVerifiedAt,
        transitionedAt: now,
      },
      auditEntries,
      outboxEntries,
    });

    // Synchronous cache invalidate (eng review issue 1.1 — FR-022 negative SLO).
    // Revocation is the highest-risk negative transition (Principe I); pub/sub
    // via outbox can drop messages, so we DEL the cache key in-process too.
    await this.cache.invalidate(compliance.conseillerId as ConseillerId);
  }

  private enforceRbac(role: AuthRole): void {
    if (role !== 'admin') {
      throw new UnauthorizedException('Only admins can revoke a conseiller (Principe IX).');
    }
  }

  private validateReason(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.length < MIN_REASON_LENGTH) {
      throw new BadRequestException(
        `Revocation reason must be ≥ ${MIN_REASON_LENGTH} characters (FR-010).`,
      );
    }
    if (trimmed.length > MAX_REASON_LENGTH) {
      throw new BadRequestException(`Revocation reason must be ≤ ${MAX_REASON_LENGTH} characters.`);
    }
    return trimmed;
  }
}
