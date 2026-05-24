// Port ConformiteWriter — mutations du module conformité.
// Méthodes coarse-grained : chacune représente une opération métier
// atomique (transaction Prisma au niveau de l'adapter T060).
//
// Les écritures d'audit et d'outbox sont passées en paramètre des
// write args correspondants, garantissant que tout est commit
// transactionnellement avec la mutation métier (B1 — pattern outbox).

import type {
  AdminId,
  AffiliationId,
  CertificatId,
  ConseillerComplianceId,
  ConseillerId,
  SubmissionId,
  UploadIntentId,
} from '@cv/shared/conformite';
import type { ConseillerCompliance } from '../../domain/entities/conseiller-compliance.entity';
import type {
  AllowedMimeType,
  UploadIntent,
  UploadPurpose,
} from '../../domain/entities/upload-intent.entity';
import type { ConformiteStatus } from '../../domain/value-objects/conformite-status.vo';
import type { Province } from '../../domain/value-objects/province.vo';
import type { AuditEntryToCreate } from './audit-log-writer.port';
import type { OutboxEntryToCreate } from './outbox-writer.port';

// --- get-or-create initial compliance ---

export interface GetOrCreateComplianceArgs {
  readonly conseillerId: ConseillerId;
  readonly now: Date;
}

// --- request upload URLs (B2) ---

export interface CreateUploadIntentArgs {
  readonly id: UploadIntentId;
  readonly purpose: UploadPurpose;
  readonly expectedContentType: AllowedMimeType;
  readonly expectedContentLength: number;
  readonly objectKey: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface CreateUploadIntentsArgs {
  readonly conseillerComplianceId: ConseillerComplianceId;
  readonly intents: ReadonlyArray<CreateUploadIntentArgs>;
}

// --- submit dossier ---

export interface SubmitCertificateArgs {
  readonly id: CertificatId;
  readonly province: Province;
  readonly certificateNumber: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly documentObjectKey: string;
  readonly uploadIntentId: UploadIntentId;
}

export interface SubmitAffiliationArgs {
  readonly id: AffiliationId;
  readonly agencyName: string;
  readonly agencyPermitNumber: string;
  readonly agencyProvince: Province;
  readonly proofObjectKey: string;
  readonly uploadIntentId: UploadIntentId;
  readonly role: string | null;
  readonly activeSince: Date | null;
}

export interface SubmitDossierWriteArgs {
  readonly conseillerComplianceId: ConseillerComplianceId;
  readonly submissionId: SubmissionId;
  readonly submittedAt: Date;
  readonly consentGiven: boolean;
  readonly certificates: ReadonlyArray<SubmitCertificateArgs>;
  readonly affiliations: ReadonlyArray<SubmitAffiliationArgs>;
  readonly auditEntries: ReadonlyArray<AuditEntryToCreate>;
  readonly outboxEntries: ReadonlyArray<OutboxEntryToCreate>;
}

// --- approve / refuse ---

export interface StatusTransition {
  readonly conseillerComplianceId: ConseillerComplianceId;
  readonly from: ConformiteStatus;
  readonly to: ConformiteStatus;
  readonly newLastVerifiedAt: Date | null;
  readonly transitionedAt: Date;
}

export interface ApproveSubmissionWriteArgs {
  readonly submissionId: SubmissionId;
  readonly adminId: AdminId;
  readonly decidedAt: Date;
  readonly comment: string | null;
  /** Null si le statut conformité ne change pas suite à l'approbation. */
  readonly statusTransition: StatusTransition | null;
  readonly auditEntries: ReadonlyArray<AuditEntryToCreate>;
  readonly outboxEntries: ReadonlyArray<OutboxEntryToCreate>;
}

export interface RefuseSubmissionWriteArgs {
  readonly submissionId: SubmissionId;
  readonly adminId: AdminId;
  readonly decidedAt: Date;
  readonly reason: string; // ≥ 20 chars (FR-004)
  readonly auditEntries: ReadonlyArray<AuditEntryToCreate>;
  readonly outboxEntries: ReadonlyArray<OutboxEntryToCreate>;
}

// --- port interface ---

export interface ConformiteWriter {
  /** Créé si absent ; retourne l'existante sinon. État initial : pending. */
  getOrCreateCompliance(args: GetOrCreateComplianceArgs): Promise<ConseillerCompliance>;

  createUploadIntents(args: CreateUploadIntentsArgs): Promise<ReadonlyArray<UploadIntent>>;

  markUploadIntentsConsumed(ids: ReadonlyArray<UploadIntentId>, consumedAt: Date): Promise<void>;

  submitDossier(args: SubmitDossierWriteArgs): Promise<void>;

  approveSubmission(args: ApproveSubmissionWriteArgs): Promise<void>;

  refuseSubmission(args: RefuseSubmissionWriteArgs): Promise<void>;
}

export const CONFORMITE_WRITER = Symbol.for('ConformiteWriter');
