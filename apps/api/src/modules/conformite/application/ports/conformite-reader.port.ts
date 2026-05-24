// Port ConformiteReader — lectures (queries) du module conformité.
// Aucune mutation : queries pures retournant des entités du domaine.
// Cf. Principe VIII *Interface Segregation* (séparé de ConformiteWriter).

import type {
  ConseillerComplianceId,
  ConseillerId,
  SubmissionId,
  UploadIntentId,
} from '@cv/shared/conformite';
import type { Affiliation } from '../../domain/entities/affiliation.entity';
import type { Certificat } from '../../domain/entities/certificat.entity';
import type { ConseillerCompliance } from '../../domain/entities/conseiller-compliance.entity';
import type { PermitRevocation } from '../../domain/entities/permit-revocation.entity';
import type { Submission, SubmissionStatus } from '../../domain/entities/submission.entity';
import type { UploadIntent } from '../../domain/entities/upload-intent.entity';

export interface PaginatedResult<T> {
  readonly items: ReadonlyArray<T>;
  readonly total: number;
}

export interface ListSubmissionsQuery {
  readonly status: SubmissionStatus;
  readonly page: number; // 1-indexed
  readonly pageSize: number;
}

export interface ConformiteReader {
  findComplianceByConseillerId(id: ConseillerId): Promise<ConseillerCompliance | null>;
  findComplianceById(id: ConseillerComplianceId): Promise<ConseillerCompliance | null>;

  listCertificatsForCompliance(id: ConseillerComplianceId): Promise<ReadonlyArray<Certificat>>;
  listAffiliationsForCompliance(id: ConseillerComplianceId): Promise<ReadonlyArray<Affiliation>>;

  /** Récupère les révocations de permis pour la cascade FR-015. */
  listPermitRevocations(): Promise<ReadonlyArray<PermitRevocation>>;

  findSubmission(id: SubmissionId): Promise<Submission | null>;
  listSubmissions(query: ListSubmissionsQuery): Promise<PaginatedResult<Submission>>;
  listCertificatsForSubmission(id: SubmissionId): Promise<ReadonlyArray<Certificat>>;
  listAffiliationsForSubmission(id: SubmissionId): Promise<ReadonlyArray<Affiliation>>;

  findUploadIntent(id: UploadIntentId): Promise<UploadIntent | null>;
}

export const CONFORMITE_READER = Symbol.for('ConformiteReader');
