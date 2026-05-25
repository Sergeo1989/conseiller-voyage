// Fakes en mémoire des ports de la couche application — utilisés par les
// tests unitaires des use cases. Underscore prefix → ignoré par vitest.
//
// Pas d'assertion stricte ici : ce sont des doubles de test simples,
// chaque méthode persiste dans une Map / un tableau interne.

import type {
  AdminId,
  AffiliationId,
  CertificatId,
  ConseillerComplianceId,
  ConseillerId,
  SubmissionId,
  UploadIntentId,
} from '@cv/shared/conformite';
import { ConseillerComplianceIdSchema } from '@cv/shared/conformite';
import type { Clock } from '../../../../common/ports/clock.port';
import type { Affiliation } from '../../domain/entities/affiliation.entity';
import type { Certificat } from '../../domain/entities/certificat.entity';
import type { ConseillerCompliance } from '../../domain/entities/conseiller-compliance.entity';
import type { PermitRevocation } from '../../domain/entities/permit-revocation.entity';
import type { Submission } from '../../domain/entities/submission.entity';
import type { UploadIntent } from '../../domain/entities/upload-intent.entity';
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
} from '../ports';
import type { AuditEntryToCreate, AuditLogWriter } from '../ports/audit-log-writer.port';
import type {
  ConformiteStatusCache,
  VerificationStatus,
} from '../ports/conformite-status-cache.port';
import type {
  DocumentStoragePort,
  ObjectMetadata,
  PresignDownloadOptions,
  PresignedUploadUrl,
} from '../ports/document-storage.port';
import type { NotificationPort, NotificationToSend } from '../ports/notification.port';
import type { OutboxEntryToCreate, OutboxWriter } from '../ports/outbox-writer.port';

// --- Clock ---

export class FakeClock implements Clock {
  constructor(private currentTime: Date) {}
  now(): Date {
    return new Date(this.currentTime);
  }
  nowMs(): number {
    return this.currentTime.getTime();
  }
  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }
  set(date: Date): void {
    this.currentTime = new Date(date);
  }
}

// --- ConformiteReader / Writer ---

export class FakeConformiteRepository implements ConformiteReader, ConformiteWriter {
  public readonly compliances = new Map<ConseillerComplianceId, ConseillerCompliance>();
  public readonly compliancesByConseillerId = new Map<ConseillerId, ConseillerComplianceId>();
  public readonly certificats = new Map<CertificatId, Certificat>();
  public readonly affiliations = new Map<AffiliationId, Affiliation>();
  public readonly submissions = new Map<SubmissionId, Submission>();
  public readonly certificatsBySubmission = new Map<SubmissionId, CertificatId[]>();
  public readonly affiliationsBySubmission = new Map<SubmissionId, AffiliationId[]>();
  public readonly uploadIntents = new Map<UploadIntentId, UploadIntent>();
  public readonly permitRevocations: PermitRevocation[] = [];
  public idCounter = 1_000;

  // --- Reader ---

  findComplianceByConseillerId(id: ConseillerId): Promise<ConseillerCompliance | null> {
    const complianceId = this.compliancesByConseillerId.get(id);
    return Promise.resolve(complianceId ? (this.compliances.get(complianceId) ?? null) : null);
  }

  findComplianceById(id: ConseillerComplianceId): Promise<ConseillerCompliance | null> {
    return Promise.resolve(this.compliances.get(id) ?? null);
  }

  listVerifiedCompliances(): Promise<ReadonlyArray<ConseillerCompliance>> {
    return Promise.resolve(
      [...this.compliances.values()].filter(
        (c) => c.status === 'verified' && c.anonymizedAt === null,
      ),
    );
  }

  findVerifiedByConseillerId(id: ConseillerId): Promise<ConseillerCompliance | null> {
    const complianceId = this.compliancesByConseillerId.get(id);
    if (!complianceId) return Promise.resolve(null);
    const compliance = this.compliances.get(complianceId);
    if (!compliance) return Promise.resolve(null);
    if (compliance.status !== 'verified' || compliance.anonymizedAt !== null) {
      return Promise.resolve(null);
    }
    return Promise.resolve(compliance);
  }

  listCertificatsForCompliance(id: ConseillerComplianceId): Promise<ReadonlyArray<Certificat>> {
    return Promise.resolve(
      [...this.certificats.values()].filter((c) => c.conseillerComplianceId === id),
    );
  }

  listAffiliationsForCompliance(id: ConseillerComplianceId): Promise<ReadonlyArray<Affiliation>> {
    return Promise.resolve(
      [...this.affiliations.values()].filter((a) => a.conseillerComplianceId === id),
    );
  }

  listPermitRevocations(): Promise<ReadonlyArray<PermitRevocation>> {
    return Promise.resolve([...this.permitRevocations]);
  }

  findSubmission(id: SubmissionId): Promise<Submission | null> {
    return Promise.resolve(this.submissions.get(id) ?? null);
  }

  listSubmissions(query: ListSubmissionsQuery): Promise<PaginatedResult<Submission>> {
    const all = [...this.submissions.values()].filter((s) => s.status === query.status);
    const start = (query.page - 1) * query.pageSize;
    const items = all.slice(start, start + query.pageSize);
    return Promise.resolve({ items, total: all.length });
  }

  listCertificatsForSubmission(id: SubmissionId): Promise<ReadonlyArray<Certificat>> {
    const ids = this.certificatsBySubmission.get(id) ?? [];
    return Promise.resolve(
      ids.map((cid) => this.certificats.get(cid)).filter((c): c is Certificat => Boolean(c)),
    );
  }

  listAffiliationsForSubmission(id: SubmissionId): Promise<ReadonlyArray<Affiliation>> {
    const ids = this.affiliationsBySubmission.get(id) ?? [];
    return Promise.resolve(
      ids.map((aid) => this.affiliations.get(aid)).filter((a): a is Affiliation => Boolean(a)),
    );
  }

  findUploadIntent(id: UploadIntentId): Promise<UploadIntent | null> {
    return Promise.resolve(this.uploadIntents.get(id) ?? null);
  }

  /** Audit entries seeded directement par les tests (in-memory). */
  public readonly auditEntries: Array<{
    id: string;
    conseillerComplianceId: ConseillerComplianceId | null;
    eventType: string;
    actorRole: 'conseiller' | 'admin' | 'system';
    occurredAt: Date;
    payload: Record<string, unknown>;
  }> = [];

  listAuditEntriesForCompliance(args: {
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
    const filtered = this.auditEntries
      .filter((e) => e.conseillerComplianceId === args.conseillerComplianceId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const startIdx = args.cursor ? filtered.findIndex((e) => e.id === args.cursor) + 1 : 0;
    const items = filtered.slice(startIdx, startIdx + args.pageSize);
    const nextCursor =
      startIdx + items.length < filtered.length ? (items[items.length - 1]?.id ?? null) : null;
    return Promise.resolve({
      items: items.map(({ id, eventType, actorRole, occurredAt, payload }) => ({
        id,
        eventType,
        actorRole,
        occurredAt,
        payload,
      })),
      nextCursor,
    });
  }

  listCertificatsExpiringInWindow(from: Date, to: Date): Promise<ReadonlyArray<Certificat>> {
    return Promise.resolve(
      [...this.certificats.values()].filter(
        (c) =>
          c.decision === 'approved' &&
          c.supersededById === null &&
          c.expiresAt >= from &&
          c.expiresAt < to,
      ),
    );
  }

  listExpiredUnconsumedUploadIntents(olderThan: Date): Promise<ReadonlyArray<UploadIntent>> {
    return Promise.resolve(
      [...this.uploadIntents.values()].filter(
        (i) => i.consumedAt === null && i.expiresAt < olderThan,
      ),
    );
  }

  listCompliancesWithErasureRequested(): Promise<ReadonlyArray<ConseillerCompliance>> {
    return Promise.resolve(
      [...this.compliances.values()].filter(
        (c) => c.erasureRequestedAt !== null && c.anonymizedAt === null,
      ),
    );
  }

  // --- Writer ---

  getOrCreateCompliance(args: GetOrCreateComplianceArgs): Promise<ConseillerCompliance> {
    const existing = this.compliancesByConseillerId.get(args.conseillerId);
    if (existing) {
      const compliance = this.compliances.get(existing);
      if (compliance) return Promise.resolve(compliance);
    }
    const id = ConseillerComplianceIdSchema.parse(
      `00000000-0000-4000-8000-${String(this.idCounter++).padStart(12, '0')}`,
    );
    const compliance: ConseillerCompliance = {
      id,
      conseillerId: args.conseillerId,
      status: 'pending',
      lastVerifiedAt: null,
      lastStatusChangeAt: args.now,
      consentToProcessGivenAt: null,
      erasureRequestedAt: null,
      anonymizedAt: null,
    };
    this.compliances.set(id, compliance);
    this.compliancesByConseillerId.set(args.conseillerId, id);
    return Promise.resolve(compliance);
  }

  createUploadIntents(args: CreateUploadIntentsArgs): Promise<ReadonlyArray<UploadIntent>> {
    const created: UploadIntent[] = [];
    for (const intent of args.intents) {
      const ui: UploadIntent = {
        id: intent.id,
        conseillerComplianceId: args.conseillerComplianceId,
        purpose: intent.purpose,
        expectedContentType: intent.expectedContentType,
        expectedContentLength: intent.expectedContentLength,
        objectKey: intent.objectKey,
        createdAt: intent.createdAt,
        expiresAt: intent.expiresAt,
        consumedAt: null,
      };
      this.uploadIntents.set(intent.id, ui);
      created.push(ui);
    }
    return Promise.resolve(created);
  }

  markUploadIntentsConsumed(ids: ReadonlyArray<UploadIntentId>, consumedAt: Date): Promise<void> {
    for (const id of ids) {
      const intent = this.uploadIntents.get(id);
      if (intent) {
        this.uploadIntents.set(id, { ...intent, consumedAt });
      }
    }
    return Promise.resolve();
  }

  submitDossier(args: SubmitDossierWriteArgs): Promise<void> {
    // crée Submission
    this.submissions.set(args.submissionId, {
      id: args.submissionId,
      conseillerComplianceId: args.conseillerComplianceId,
      submittedAt: args.submittedAt,
      status: 'pending',
      decidedAt: null,
      decidedByAdminId: null,
      decisionReason: null,
    });

    // crée Certificats
    const certIds: CertificatId[] = [];
    for (const c of args.certificates) {
      this.certificats.set(c.id, {
        id: c.id,
        conseillerComplianceId: args.conseillerComplianceId,
        province: c.province,
        certificateNumber: c.certificateNumber,
        issuedAt: c.issuedAt,
        expiresAt: c.expiresAt,
        documentObjectKey: c.documentObjectKey,
        submittedAt: args.submittedAt,
        decision: 'pending',
        decisionAt: null,
        decisionByAdminId: null,
        refusalReason: null,
        supersededById: null,
      });
      certIds.push(c.id);
    }
    this.certificatsBySubmission.set(args.submissionId, certIds);

    // crée Affiliations
    const affilIds: AffiliationId[] = [];
    for (const a of args.affiliations) {
      this.affiliations.set(a.id, {
        id: a.id,
        conseillerComplianceId: args.conseillerComplianceId,
        agencyName: a.agencyName,
        agencyPermitNumber: a.agencyPermitNumber,
        agencyProvince: a.agencyProvince,
        proofObjectKey: a.proofObjectKey,
        submittedAt: args.submittedAt,
        decision: 'pending',
        decisionAt: null,
        decisionByAdminId: null,
        refusalReason: null,
        role: a.role,
        activeSince: a.activeSince,
        activeUntil: null,
        inactivatedBy: null,
        inactivatedAt: null,
      });
      affilIds.push(a.id);
    }
    this.affiliationsBySubmission.set(args.submissionId, affilIds);

    // marque les UploadIntents consumed
    const consumedIds = [
      ...args.certificates.map((c) => c.uploadIntentId),
      ...args.affiliations.map((a) => a.uploadIntentId),
    ];
    for (const id of consumedIds) {
      const intent = this.uploadIntents.get(id);
      if (intent) this.uploadIntents.set(id, { ...intent, consumedAt: args.submittedAt });
    }

    // applique le consentement si premier
    const compliance = this.compliances.get(args.conseillerComplianceId);
    if (compliance && !compliance.consentToProcessGivenAt && args.consentGiven) {
      this.compliances.set(args.conseillerComplianceId, {
        ...compliance,
        consentToProcessGivenAt: args.submittedAt,
      });
    }

    return Promise.resolve();
  }

  approveSubmission(args: ApproveSubmissionWriteArgs): Promise<void> {
    const submission = this.submissions.get(args.submissionId);
    if (!submission) return Promise.resolve();
    this.submissions.set(args.submissionId, {
      ...submission,
      status: 'approved',
      decidedAt: args.decidedAt,
      decidedByAdminId: args.adminId,
      decisionReason: args.comment,
    });
    this.markCertificatsDecision(args.submissionId, 'approved', args.decidedAt, args.adminId, null);
    this.markAffiliationsDecision(
      args.submissionId,
      'approved',
      args.decidedAt,
      args.adminId,
      null,
    );
    this.applyApproveTransition(args.statusTransition);
    return Promise.resolve();
  }

  /** Audit + outbox entries écrits via les writers métier (submit, approve, refuse, applyStatusTransition, declarePermitRevoked). */
  public readonly writerAuditEntries: AuditEntryToCreate[] = [];
  public readonly writerOutboxEntries: OutboxEntryToCreate[] = [];

  markErasureRequested(args: {
    conseillerComplianceId: ConseillerComplianceId;
    requestedAt: Date;
    auditEntries: ReadonlyArray<AuditEntryToCreate>;
    outboxEntries: ReadonlyArray<OutboxEntryToCreate>;
  }): Promise<void> {
    const compliance = this.compliances.get(args.conseillerComplianceId);
    if (compliance) {
      this.compliances.set(compliance.id, {
        ...compliance,
        erasureRequestedAt: args.requestedAt,
      });
    }
    this.writerAuditEntries.push(...args.auditEntries);
    this.writerOutboxEntries.push(...args.outboxEntries);
    return Promise.resolve();
  }

  anonymizeCompliance(args: {
    conseillerComplianceId: ConseillerComplianceId;
    anonymizedAt: Date;
    auditEntries: ReadonlyArray<AuditEntryToCreate>;
    outboxEntries: ReadonlyArray<OutboxEntryToCreate>;
  }): Promise<void> {
    const compliance = this.compliances.get(args.conseillerComplianceId);
    if (compliance) {
      this.compliances.set(compliance.id, {
        ...compliance,
        anonymizedAt: args.anonymizedAt,
      });
    }
    this.writerAuditEntries.push(...args.auditEntries);
    this.writerOutboxEntries.push(...args.outboxEntries);
    return Promise.resolve();
  }

  declarePermitRevoked(
    args: import('../ports/conformite-writer.port').DeclarePermitRevokedWriteArgs,
  ): Promise<void> {
    this.permitRevocations.push({
      id: args.permitRevocationId,
      agencyPermitNumber: args.agencyPermitNumber,
      agencyProvince: args.agencyProvince,
      revokedAt: args.revokedAt,
      declaredByAdminId: args.declaredByAdminId,
      reason: args.reason,
    });
    for (const affilId of args.affectedAffiliationIds) {
      const affil = this.affiliations.get(affilId);
      if (affil) {
        this.affiliations.set(affilId, {
          ...affil,
          inactivatedAt: args.revokedAt,
          inactivatedBy: 'permit_revocation',
        });
      }
    }
    for (const t of args.statusTransitions) {
      const compliance = this.compliances.get(t.conseillerComplianceId);
      if (compliance) {
        this.compliances.set(compliance.id, {
          ...compliance,
          status: t.to,
          lastStatusChangeAt: t.transitionedAt,
        });
      }
    }
    this.writerAuditEntries.push(...args.auditEntries);
    this.writerOutboxEntries.push(...args.outboxEntries);
    return Promise.resolve();
  }

  applyStatusTransition(
    args: import('../ports/conformite-writer.port').ApplyStatusTransitionWriteArgs,
  ): Promise<void> {
    const t = args.transition;
    const compliance = this.compliances.get(t.conseillerComplianceId);
    if (!compliance) return Promise.resolve();
    this.compliances.set(compliance.id, {
      ...compliance,
      status: t.to,
      lastStatusChangeAt: t.transitionedAt,
      lastVerifiedAt: t.newLastVerifiedAt ?? compliance.lastVerifiedAt,
    });
    this.writerAuditEntries.push(...args.auditEntries);
    this.writerOutboxEntries.push(...args.outboxEntries);
    return Promise.resolve();
  }

  refuseSubmission(args: RefuseSubmissionWriteArgs): Promise<void> {
    const submission = this.submissions.get(args.submissionId);
    if (!submission) return Promise.resolve();
    this.submissions.set(args.submissionId, {
      ...submission,
      status: 'refused',
      decidedAt: args.decidedAt,
      decidedByAdminId: args.adminId,
      decisionReason: args.reason,
    });
    this.markCertificatsDecision(
      args.submissionId,
      'refused',
      args.decidedAt,
      args.adminId,
      args.reason,
    );
    this.markAffiliationsDecision(
      args.submissionId,
      'refused',
      args.decidedAt,
      args.adminId,
      args.reason,
    );
    return Promise.resolve();
  }

  // --- helpers privés pour respecter complexité Biome ---

  private markCertificatsDecision(
    submissionId: SubmissionId,
    decision: 'approved' | 'refused',
    decidedAt: Date,
    adminId: AdminId,
    refusalReason: string | null,
  ): void {
    const ids = this.certificatsBySubmission.get(submissionId) ?? [];
    for (const cid of ids) {
      const c = this.certificats.get(cid);
      if (c) {
        this.certificats.set(cid, {
          ...c,
          decision,
          decisionAt: decidedAt,
          decisionByAdminId: adminId,
          refusalReason,
        });
      }
    }
  }

  private markAffiliationsDecision(
    submissionId: SubmissionId,
    decision: 'approved' | 'refused',
    decidedAt: Date,
    adminId: AdminId,
    refusalReason: string | null,
  ): void {
    const ids = this.affiliationsBySubmission.get(submissionId) ?? [];
    for (const aid of ids) {
      const a = this.affiliations.get(aid);
      if (a) {
        this.affiliations.set(aid, {
          ...a,
          decision,
          decisionAt: decidedAt,
          decisionByAdminId: adminId,
          refusalReason,
        });
      }
    }
  }

  private applyApproveTransition(transition: ApproveSubmissionWriteArgs['statusTransition']): void {
    if (!transition) return;
    const compliance = this.compliances.get(transition.conseillerComplianceId);
    if (!compliance) return;
    this.compliances.set(compliance.id, {
      ...compliance,
      status: transition.to,
      lastStatusChangeAt: transition.transitionedAt,
      lastVerifiedAt: transition.newLastVerifiedAt ?? compliance.lastVerifiedAt,
    });
  }

  // --- helpers test ---

  seedPermitRevocation(rev: PermitRevocation): void {
    this.permitRevocations.push(rev);
  }
}

// --- AuditLogWriter ---

export class FakeAuditLogWriter implements AuditLogWriter {
  public readonly entries: AuditEntryToCreate[] = [];

  write(entry: AuditEntryToCreate): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

// --- OutboxWriter ---

export class FakeOutboxWriter implements OutboxWriter {
  public readonly entries: OutboxEntryToCreate[] = [];

  write(entry: OutboxEntryToCreate): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

// --- ConformiteStatusCache ---

export class FakeConformiteStatusCache implements ConformiteStatusCache {
  public readonly invalidations: ConseillerId[] = [];
  public readonly storage = new Map<ConseillerId, VerificationStatus>();

  get(conseillerId: ConseillerId): Promise<VerificationStatus | null> {
    return Promise.resolve(this.storage.get(conseillerId) ?? null);
  }

  set(status: VerificationStatus): Promise<void> {
    this.storage.set(status.conseillerId, status);
    return Promise.resolve();
  }

  invalidate(conseillerId: ConseillerId): Promise<void> {
    this.invalidations.push(conseillerId);
    this.storage.delete(conseillerId);
    return Promise.resolve();
  }
}

// --- NotificationPort ---

export class FakeNotificationPort implements NotificationPort {
  public readonly sent: NotificationToSend[] = [];

  enqueue(notification: NotificationToSend): Promise<void> {
    this.sent.push(notification);
    return Promise.resolve();
  }
}

// --- DocumentStoragePort ---

export class FakeDocumentStorage implements DocumentStoragePort {
  public readonly storage = new Map<string, ObjectMetadata>();
  public readonly downloads: string[] = [];
  public readonly deletes: string[] = [];

  presignUpload(args: {
    objectKey: string;
    contentType: string;
    contentLength: number;
    ttlSeconds: number;
  }): Promise<PresignedUploadUrl> {
    // Simule un objet effectivement uploadé pour les tests downstream.
    this.storage.set(args.objectKey, {
      contentType: args.contentType,
      contentLength: args.contentLength,
      lastModified: new Date(),
    });
    return Promise.resolve({
      url: `https://fake-s3/${args.objectKey}?signed`,
      requiredHeaders: { 'Content-Type': args.contentType },
      expiresAt: new Date(Date.now() + args.ttlSeconds * 1000),
    });
  }

  headObject(objectKey: string): Promise<ObjectMetadata | null> {
    return Promise.resolve(this.storage.get(objectKey) ?? null);
  }

  presignDownload(objectKey: string, _options?: PresignDownloadOptions): Promise<string> {
    this.downloads.push(objectKey);
    return Promise.resolve(`https://fake-s3/${objectKey}?signed-download`);
  }

  deleteObject(objectKey: string): Promise<void> {
    this.storage.delete(objectKey);
    this.deletes.push(objectKey);
    return Promise.resolve();
  }
}
