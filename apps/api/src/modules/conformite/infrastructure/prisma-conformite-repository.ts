// T060 — PrismaConformiteRepository.
// Implémente ConformiteReader + ConformiteWriter via Prisma.
//
// Stratégie transactionnelle (B1 outbox) :
//   - submitDossier / approveSubmission / refuseSubmission ouvrent
//     UNE SEULE transaction Prisma qui regroupe la mutation métier +
//     les AuditEntry + les OutboxEntry passés en args.
//   - createUploadIntents reste hors transaction (création atomique
//     côté Prisma via createMany).
//   - getOrCreateCompliance utilise upsert idempotent.
//
// Mapping Prisma ↔ domaine :
//   - Les enums Prisma sont strictement alignés avec les enums du
//     domaine (Province, ConformiteStatus, etc.) → cast direct sûr.
//   - Les UUID typés en `@db.Uuid` sortent comme strings Prisma → on
//     les recaste via les schémas brand (préserve la safety, runtime
//     no-op).

import { type AffiliationInactivationReason, type Prisma, prisma } from '@cv/db';
import type {
  AdminId,
  AffiliationId,
  CertificatId,
  ConseillerComplianceId,
  ConseillerId,
  PermitRevocationId,
  SubmissionId,
  UploadIntentId,
} from '@cv/shared/conformite';
import { Injectable } from '@nestjs/common';
import type {
  ApproveSubmissionWriteArgs,
  ConformiteReader,
  ConformiteWriter,
  CreateUploadIntentsArgs,
  GetOrCreateComplianceArgs,
  ListSubmissionsQuery,
  PaginatedResult,
  RefuseSubmissionWriteArgs,
  SubmitDossierWriteArgs,
} from '../application/ports';
import type { AuditEntryToCreate } from '../application/ports/audit-log-writer.port';
import type { OutboxEntryToCreate } from '../application/ports/outbox-writer.port';
import type { Affiliation } from '../domain/entities/affiliation.entity';
import type { Certificat } from '../domain/entities/certificat.entity';
import type { ConseillerCompliance } from '../domain/entities/conseiller-compliance.entity';
import type { PermitRevocation } from '../domain/entities/permit-revocation.entity';
import type { Submission, SubmissionStatus } from '../domain/entities/submission.entity';
import type { UploadIntent, UploadPurpose } from '../domain/entities/upload-intent.entity';

type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaConformiteRepository implements ConformiteReader, ConformiteWriter {
  // --- READER ---

  async findComplianceByConseillerId(id: ConseillerId): Promise<ConseillerCompliance | null> {
    const row = await prisma.conseillerCompliance.findUnique({ where: { conseillerId: id } });
    return row ? this.mapCompliance(row) : null;
  }

  async findComplianceById(id: ConseillerComplianceId): Promise<ConseillerCompliance | null> {
    const row = await prisma.conseillerCompliance.findUnique({ where: { id } });
    return row ? this.mapCompliance(row) : null;
  }

  /**
   * FR-007 / U1 — filtre matériel verified + non anonymisé.
   * Aucune autre méthode de lecture publique ne peut court-circuiter
   * ce filtre — c'est l'unique porte de sortie vers les consommateurs
   * externes (matching, SEO, port public US3).
   */
  async listVerifiedCompliances(): Promise<ReadonlyArray<ConseillerCompliance>> {
    const rows = await prisma.conseillerCompliance.findMany({
      where: { status: 'verified', anonymizedAt: null },
    });
    return rows.map((r) => this.mapCompliance(r));
  }

  async findVerifiedByConseillerId(id: ConseillerId): Promise<ConseillerCompliance | null> {
    const row = await prisma.conseillerCompliance.findFirst({
      where: { conseillerId: id, status: 'verified', anonymizedAt: null },
    });
    return row ? this.mapCompliance(row) : null;
  }

  async listCertificatsForCompliance(
    id: ConseillerComplianceId,
  ): Promise<ReadonlyArray<Certificat>> {
    const rows = await prisma.certificat.findMany({ where: { conseillerComplianceId: id } });
    return rows.map((r) => this.mapCertificat(r));
  }

  async listAffiliationsForCompliance(
    id: ConseillerComplianceId,
  ): Promise<ReadonlyArray<Affiliation>> {
    const rows = await prisma.affiliation.findMany({ where: { conseillerComplianceId: id } });
    return rows.map((r) => this.mapAffiliation(r));
  }

  async listPermitRevocations(): Promise<ReadonlyArray<PermitRevocation>> {
    const rows = await prisma.permitRevocation.findMany();
    return rows.map((r) => this.mapPermitRevocation(r));
  }

  async findSubmission(id: SubmissionId): Promise<Submission | null> {
    const row = await prisma.submission.findUnique({ where: { id } });
    return row ? this.mapSubmission(row) : null;
  }

  async listSubmissions(query: ListSubmissionsQuery): Promise<PaginatedResult<Submission>> {
    const where = { status: query.status };
    const [items, total] = await Promise.all([
      prisma.submission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.submission.count({ where }),
    ]);
    return { items: items.map((r) => this.mapSubmission(r)), total };
  }

  async listCertificatsForSubmission(id: SubmissionId): Promise<ReadonlyArray<Certificat>> {
    const rows = await prisma.certificat.findMany({ where: { submissionId: id } });
    return rows.map((r) => this.mapCertificat(r));
  }

  async listAffiliationsForSubmission(id: SubmissionId): Promise<ReadonlyArray<Affiliation>> {
    const rows = await prisma.affiliation.findMany({ where: { submissionId: id } });
    return rows.map((r) => this.mapAffiliation(r));
  }

  async findUploadIntent(id: UploadIntentId): Promise<UploadIntent | null> {
    const row = await prisma.uploadIntent.findUnique({ where: { id } });
    return row ? this.mapUploadIntent(row) : null;
  }

  async listCertificatsExpiringInWindow(from: Date, to: Date): Promise<ReadonlyArray<Certificat>> {
    const rows = await prisma.certificat.findMany({
      where: {
        decision: 'approved',
        supersededById: null,
        expiresAt: { gte: from, lt: to },
      },
    });
    return rows.map((r) => this.mapCertificat(r));
  }

  async listAuditEntriesForCompliance(args: {
    conseillerComplianceId: ConseillerComplianceId;
    cursor: string | null;
    pageSize: number;
  }): Promise<{
    items: ReadonlyArray<{
      id: string;
      eventType: string;
      actorRole: 'conseiller' | 'admin' | 'system';
      occurredAt: Date;
      payload: Record<string, unknown>;
    }>;
    nextCursor: string | null;
  }> {
    const rows = await prisma.auditEntry.findMany({
      where: { conseillerComplianceId: args.conseillerComplianceId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: args.pageSize + 1,
      ...(args.cursor !== null && {
        cursor: { id: args.cursor },
        skip: 1,
      }),
    });
    const hasMore = rows.length > args.pageSize;
    const items = rows.slice(0, args.pageSize);
    return {
      items: items.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        actorRole: r.actorRole,
        occurredAt: r.occurredAt,
        payload: r.payload as Record<string, unknown>,
      })),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  // --- WRITER ---

  async getOrCreateCompliance(args: GetOrCreateComplianceArgs): Promise<ConseillerCompliance> {
    const row = await prisma.conseillerCompliance.upsert({
      where: { conseillerId: args.conseillerId },
      update: {},
      create: {
        conseillerId: args.conseillerId,
        status: 'pending',
        lastStatusChangeAt: args.now,
      },
    });
    return this.mapCompliance(row);
  }

  async createUploadIntents(args: CreateUploadIntentsArgs): Promise<ReadonlyArray<UploadIntent>> {
    const data = args.intents.map((i) => ({
      id: i.id,
      conseillerComplianceId: args.conseillerComplianceId,
      purpose: i.purpose,
      expectedContentType: i.expectedContentType,
      expectedContentLength: i.expectedContentLength,
      objectKey: i.objectKey,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
    }));
    await prisma.uploadIntent.createMany({ data });
    const ids = data.map((d) => d.id);
    const rows = await prisma.uploadIntent.findMany({ where: { id: { in: ids } } });
    return rows.map((r) => this.mapUploadIntent(r));
  }

  async markUploadIntentsConsumed(
    ids: ReadonlyArray<UploadIntentId>,
    consumedAt: Date,
  ): Promise<void> {
    if (ids.length === 0) return;
    await prisma.uploadIntent.updateMany({
      where: { id: { in: [...ids] } },
      data: { consumedAt },
    });
  }

  async submitDossier(args: SubmitDossierWriteArgs): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.submission.create({
        data: {
          id: args.submissionId,
          conseillerComplianceId: args.conseillerComplianceId,
          submittedAt: args.submittedAt,
          status: 'pending',
        },
      });

      if (args.certificates.length > 0) {
        await tx.certificat.createMany({
          data: args.certificates.map((c) => ({
            id: c.id,
            conseillerComplianceId: args.conseillerComplianceId,
            submissionId: args.submissionId,
            province: c.province,
            certificateNumber: c.certificateNumber,
            issuedAt: c.issuedAt,
            expiresAt: c.expiresAt,
            documentObjectKey: c.documentObjectKey,
            submittedAt: args.submittedAt,
            decision: 'pending',
          })),
        });
      }

      if (args.affiliations.length > 0) {
        await tx.affiliation.createMany({
          data: args.affiliations.map((a) => ({
            id: a.id,
            conseillerComplianceId: args.conseillerComplianceId,
            submissionId: args.submissionId,
            agencyName: a.agencyName,
            agencyPermitNumber: a.agencyPermitNumber,
            agencyProvince: a.agencyProvince,
            proofObjectKey: a.proofObjectKey,
            submittedAt: args.submittedAt,
            decision: 'pending',
            role: a.role,
            activeSince: a.activeSince,
          })),
        });
      }

      const consumedIntentIds = [
        ...args.certificates.map((c) => c.uploadIntentId),
        ...args.affiliations.map((a) => a.uploadIntentId),
      ];
      if (consumedIntentIds.length > 0) {
        await tx.uploadIntent.updateMany({
          where: { id: { in: consumedIntentIds } },
          data: { consumedAt: args.submittedAt },
        });
      }

      if (args.consentGiven) {
        await tx.conseillerCompliance.updateMany({
          where: {
            id: args.conseillerComplianceId,
            consentToProcessGivenAt: null,
          },
          data: { consentToProcessGivenAt: args.submittedAt },
        });
      }

      await this.writeAuditEntries(tx, args.auditEntries);
      await this.writeOutboxEntries(tx, args.outboxEntries);
    });
  }

  async approveSubmission(args: ApproveSubmissionWriteArgs): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: args.submissionId },
        data: {
          status: 'approved',
          decidedAt: args.decidedAt,
          decidedByAdminId: args.adminId,
          decisionReason: args.comment,
        },
      });

      await tx.certificat.updateMany({
        where: { submissionId: args.submissionId },
        data: {
          decision: 'approved',
          decisionAt: args.decidedAt,
          decisionByAdminId: args.adminId,
          refusalReason: null,
        },
      });

      await tx.affiliation.updateMany({
        where: { submissionId: args.submissionId },
        data: {
          decision: 'approved',
          decisionAt: args.decidedAt,
          decisionByAdminId: args.adminId,
          refusalReason: null,
        },
      });

      if (args.statusTransition) {
        const t = args.statusTransition;
        await tx.conseillerCompliance.update({
          where: { id: t.conseillerComplianceId },
          data: {
            status: t.to,
            lastStatusChangeAt: t.transitionedAt,
            ...(t.newLastVerifiedAt !== null && { lastVerifiedAt: t.newLastVerifiedAt }),
          },
        });
      }

      await this.writeAuditEntries(tx, args.auditEntries);
      await this.writeOutboxEntries(tx, args.outboxEntries);
    });
  }

  async applyStatusTransition(
    args: import('../application/ports/conformite-writer.port').ApplyStatusTransitionWriteArgs,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const t = args.transition;
      await tx.conseillerCompliance.update({
        where: { id: t.conseillerComplianceId },
        data: {
          status: t.to,
          lastStatusChangeAt: t.transitionedAt,
          ...(t.newLastVerifiedAt !== null && { lastVerifiedAt: t.newLastVerifiedAt }),
        },
      });
      await this.writeAuditEntries(tx, args.auditEntries);
      await this.writeOutboxEntries(tx, args.outboxEntries);
    });
  }

  async declarePermitRevoked(
    args: import('../application/ports/conformite-writer.port').DeclarePermitRevokedWriteArgs,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.permitRevocation.create({
        data: {
          id: args.permitRevocationId,
          agencyPermitNumber: args.agencyPermitNumber,
          agencyProvince: args.agencyProvince,
          revokedAt: args.revokedAt,
          declaredByAdminId: args.declaredByAdminId,
          reason: args.reason,
        },
      });
      if (args.affectedAffiliationIds.length > 0) {
        await tx.affiliation.updateMany({
          where: { id: { in: [...args.affectedAffiliationIds] } },
          data: {
            inactivatedAt: args.revokedAt,
            inactivatedBy: 'permit_revocation',
          },
        });
      }
      for (const t of args.statusTransitions) {
        await tx.conseillerCompliance.update({
          where: { id: t.conseillerComplianceId },
          data: { status: t.to, lastStatusChangeAt: t.transitionedAt },
        });
      }
      await this.writeAuditEntries(tx, args.auditEntries);
      await this.writeOutboxEntries(tx, args.outboxEntries);
    });
  }

  async refuseSubmission(args: RefuseSubmissionWriteArgs): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: args.submissionId },
        data: {
          status: 'refused',
          decidedAt: args.decidedAt,
          decidedByAdminId: args.adminId,
          decisionReason: args.reason,
        },
      });

      await tx.certificat.updateMany({
        where: { submissionId: args.submissionId },
        data: {
          decision: 'refused',
          decisionAt: args.decidedAt,
          decisionByAdminId: args.adminId,
          refusalReason: args.reason,
        },
      });

      await tx.affiliation.updateMany({
        where: { submissionId: args.submissionId },
        data: {
          decision: 'refused',
          decisionAt: args.decidedAt,
          decisionByAdminId: args.adminId,
          refusalReason: args.reason,
        },
      });

      await this.writeAuditEntries(tx, args.auditEntries);
      await this.writeOutboxEntries(tx, args.outboxEntries);
    });
  }

  // --- Helpers internes ---

  private async writeAuditEntries(
    tx: Tx,
    entries: ReadonlyArray<AuditEntryToCreate>,
  ): Promise<void> {
    if (entries.length === 0) return;
    await tx.auditEntry.createMany({
      data: entries.map((e) => ({
        conseillerComplianceId: e.conseillerComplianceId,
        eventType: e.eventType,
        actorId: e.actorId,
        actorRole: e.actorRole,
        payload: e.payload as Prisma.InputJsonValue,
        idempotencyKey: e.idempotencyKey,
        correlationId: e.correlationId,
      })),
    });
  }

  private async writeOutboxEntries(
    tx: Tx,
    entries: ReadonlyArray<OutboxEntryToCreate>,
  ): Promise<void> {
    if (entries.length === 0) return;
    await tx.outboxEntry.createMany({
      data: entries.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        payload: e.payload as Prisma.InputJsonValue,
      })),
    });
  }

  // --- Mappers Prisma → domain ---

  private mapCompliance(row: Prisma.ConseillerComplianceGetPayload<true>): ConseillerCompliance {
    return {
      id: row.id as ConseillerComplianceId,
      conseillerId: row.conseillerId as ConseillerId,
      status: row.status,
      lastVerifiedAt: row.lastVerifiedAt,
      lastStatusChangeAt: row.lastStatusChangeAt,
      consentToProcessGivenAt: row.consentToProcessGivenAt,
      erasureRequestedAt: row.erasureRequestedAt,
      anonymizedAt: row.anonymizedAt,
    };
  }

  private mapSubmission(row: Prisma.SubmissionGetPayload<true>): Submission {
    return {
      id: row.id as SubmissionId,
      conseillerComplianceId: row.conseillerComplianceId as ConseillerComplianceId,
      submittedAt: row.submittedAt,
      status: row.status as SubmissionStatus,
      decidedAt: row.decidedAt,
      decidedByAdminId: row.decidedByAdminId as AdminId | null,
      decisionReason: row.decisionReason,
    };
  }

  private mapCertificat(row: Prisma.CertificatGetPayload<true>): Certificat {
    return {
      id: row.id as CertificatId,
      conseillerComplianceId: row.conseillerComplianceId as ConseillerComplianceId,
      province: row.province,
      certificateNumber: row.certificateNumber,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      documentObjectKey: row.documentObjectKey,
      submittedAt: row.submittedAt,
      decision: row.decision,
      decisionAt: row.decisionAt,
      decisionByAdminId: row.decisionByAdminId,
      refusalReason: row.refusalReason,
      supersededById: row.supersededById as CertificatId | null,
    };
  }

  private mapAffiliation(row: Prisma.AffiliationGetPayload<true>): Affiliation {
    return {
      id: row.id as AffiliationId,
      conseillerComplianceId: row.conseillerComplianceId as ConseillerComplianceId,
      agencyName: row.agencyName,
      agencyPermitNumber: row.agencyPermitNumber,
      agencyProvince: row.agencyProvince,
      proofObjectKey: row.proofObjectKey,
      submittedAt: row.submittedAt,
      decision: row.decision,
      decisionAt: row.decisionAt,
      decisionByAdminId: row.decisionByAdminId,
      refusalReason: row.refusalReason,
      role: row.role,
      activeSince: row.activeSince,
      activeUntil: row.activeUntil,
      inactivatedBy: row.inactivatedBy as AffiliationInactivationReason | null,
      inactivatedAt: row.inactivatedAt,
    };
  }

  private mapUploadIntent(row: Prisma.UploadIntentGetPayload<true>): UploadIntent {
    return {
      id: row.id as UploadIntentId,
      conseillerComplianceId: row.conseillerComplianceId as ConseillerComplianceId,
      purpose: row.purpose as UploadPurpose,
      expectedContentType: row.expectedContentType as UploadIntent['expectedContentType'],
      expectedContentLength: row.expectedContentLength,
      objectKey: row.objectKey,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      consumedAt: row.consumedAt,
    };
  }

  private mapPermitRevocation(row: Prisma.PermitRevocationGetPayload<true>): PermitRevocation {
    return {
      id: row.id as PermitRevocationId,
      agencyPermitNumber: row.agencyPermitNumber,
      agencyProvince: row.agencyProvince,
      revokedAt: row.revokedAt,
      declaredByAdminId: row.declaredByAdminId,
      reason: row.reason,
    };
  }
}
