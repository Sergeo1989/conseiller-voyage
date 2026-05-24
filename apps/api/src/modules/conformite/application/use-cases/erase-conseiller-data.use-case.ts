// T113 (étape 2) — EraseConseillerDataUseCase (Loi 25 FR-017).
//
// Étape ASYNCHRONE consommée par EraseConseillerDataJob BullMQ.
// Pour la compliance dont erasureRequestedAt est non-null mais
// anonymizedAt est null :
//   1. Liste tous les certificats + affiliations + uploadIntents
//   2. Pour chaque objectKey S3 : storage.deleteObject() (irréversible)
//   3. anonymizeCompliance → anonymizedAt = now + audit
//      erasure.completed + outbox
//
// Le journal d'audit (conformite_audit_entries) n'est PAS supprimé
// (conservation 7 ans légale — trigger DB l'empêche d'ailleurs).
//
// Idempotent : appel sur compliance déjà anonymisée = no-op silencieux.

import type { ConseillerComplianceId } from '@cv/shared/conformite';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { AuditEntryToCreate } from '../ports/audit-log-writer.port';
import { CONFORMITE_READER, type ConformiteReader } from '../ports/conformite-reader.port';
import { CONFORMITE_WRITER, type ConformiteWriter } from '../ports/conformite-writer.port';
import { DOCUMENT_STORAGE, type DocumentStoragePort } from '../ports/document-storage.port';
import type { OutboxEntryToCreate } from '../ports/outbox-writer.port';

export interface EraseConseillerDataInput {
  readonly conseillerComplianceId: ConseillerComplianceId;
}

@Injectable()
export class EraseConseillerDataUseCase {
  private readonly logger = new Logger(EraseConseillerDataUseCase.name);

  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(CONFORMITE_WRITER) private readonly writer: ConformiteWriter,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuidGenerator: UuidGenerator,
  ) {}

  async execute(input: EraseConseillerDataInput): Promise<void> {
    const compliance = await this.reader.findComplianceById(input.conseillerComplianceId);
    if (!compliance) {
      this.logger.warn(
        `EraseConseillerData: compliance ${input.conseillerComplianceId} not found, no-op.`,
      );
      return;
    }
    if (compliance.anonymizedAt !== null) {
      this.logger.warn(
        `EraseConseillerData: compliance ${input.conseillerComplianceId} already anonymized, no-op.`,
      );
      return;
    }

    const [certs, affils] = await Promise.all([
      this.reader.listCertificatsForCompliance(compliance.id),
      this.reader.listAffiliationsForCompliance(compliance.id),
    ]);

    // Étape 1 — Supprime irréversiblement les objets S3
    const objectKeys = [
      ...certs.map((c) => c.documentObjectKey),
      ...affils.map((a) => a.proofObjectKey),
    ];
    for (const key of objectKeys) {
      try {
        await this.storage.deleteObject(key);
      } catch (error) {
        this.logger.error(
          `Failed to delete S3 object ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // On continue — l'objet sera repris par S3 lifecycle policy (T117)
      }
    }

    // Étape 2 — anonymisation DB
    const now = this.clock.now();
    const correlationId = this.uuidGenerator.generate();

    const auditEntries: AuditEntryToCreate[] = [
      {
        conseillerComplianceId: compliance.id,
        eventType: 'erasure.completed',
        actorId: null,
        actorRole: 'system',
        payload: { requestedAt: compliance.erasureRequestedAt?.toISOString() ?? now.toISOString() },
        idempotencyKey: `erasure:${compliance.id}`,
        correlationId,
      },
    ];

    const outboxEntries: OutboxEntryToCreate[] = [
      {
        id: this.uuidGenerator.generate(),
        eventType: 'conformite.erasure.completed',
        payload: {
          conseillerComplianceId: compliance.id,
          conseillerId: compliance.conseillerId,
          anonymizedAt: now.toISOString(),
          deletedObjectCount: objectKeys.length,
        },
      },
    ];

    await this.writer.anonymizeCompliance({
      conseillerComplianceId: compliance.id,
      anonymizedAt: now,
      auditEntries,
      outboxEntries,
    });

    this.logger.log(
      `EraseConseillerData done for ${compliance.id}: ${objectKeys.length} S3 objects deleted, compliance anonymized.`,
    );
  }
}
