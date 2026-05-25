// T113 (étape 1) — RequestErasureUseCase (Loi 25 FR-017).
//
// Demande d'effacement par le conseiller. Étape SYNCHRONE :
//   - RBAC : conseiller only
//   - Compliance must exist + not already requested + not already anonymized
//   - markErasureRequested → erasureRequestedAt = now + audit +
//     outbox (déclenche EraseConseillerDataJob async qui appellera
//     EraseConseillerDataUseCase pour anonymisation effective)

import type { ConseillerId } from '@cv/shared/conformite';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { AuthRole } from '../../../identite/application/ports/auth-session-reader.port';
import type { AuditEntryToCreate } from '../ports/audit-log-writer.port';
import { CONFORMITE_READER, type ConformiteReader } from '../ports/conformite-reader.port';
import { CONFORMITE_WRITER, type ConformiteWriter } from '../ports/conformite-writer.port';
import type { OutboxEntryToCreate } from '../ports/outbox-writer.port';

export interface RequestErasureInput {
  readonly requestedBy: { readonly id: ConseillerId; readonly role: AuthRole };
}

@Injectable()
export class RequestErasureUseCase {
  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(CONFORMITE_WRITER) private readonly writer: ConformiteWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuidGenerator: UuidGenerator,
  ) {}

  async execute(input: RequestErasureInput): Promise<void> {
    if (input.requestedBy.role !== 'conseiller') {
      throw new UnauthorizedException('Reserved to conseillers.');
    }

    const compliance = await this.reader.findComplianceByConseillerId(input.requestedBy.id);
    if (!compliance) {
      throw new NotFoundException('Aucun dossier à effacer.');
    }
    if (compliance.anonymizedAt !== null) {
      throw new ConflictException('Dossier déjà anonymisé.');
    }
    if (compliance.erasureRequestedAt !== null) {
      throw new ConflictException("Demande d'effacement déjà enregistrée et en cours.");
    }

    const now = this.clock.now();
    const correlationId = this.uuidGenerator.generate();

    const auditEntries: AuditEntryToCreate[] = [
      {
        conseillerComplianceId: compliance.id,
        eventType: 'erasure.requested',
        actorId: input.requestedBy.id,
        actorRole: 'conseiller',
        payload: { requestedAt: now.toISOString() },
        idempotencyKey: null,
        correlationId,
      },
    ];

    const outboxEntries: OutboxEntryToCreate[] = [
      {
        id: this.uuidGenerator.generate(),
        eventType: 'conformite.erasure.requested',
        payload: {
          conseillerComplianceId: compliance.id,
          conseillerId: input.requestedBy.id,
          requestedAt: now.toISOString(),
        },
      },
    ];

    await this.writer.markErasureRequested({
      conseillerComplianceId: compliance.id,
      requestedAt: now,
      auditEntries,
      outboxEntries,
    });
  }
}
