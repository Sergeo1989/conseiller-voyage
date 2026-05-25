// Entité UploadIntent (B2 du review — empêche la forge d'uploadId).
// Persiste chaque URL signée PUT émise par RequestUploadUrlsUseCase.
// SubmitDossierUseCase vérifie chaque uploadId contre cette table avant
// d'accepter une soumission.
// Cf. data-model.md *UploadIntent* + research.md R8.

import type { ConseillerComplianceId, UploadIntentId } from '@cv/shared/conformite';

export const UPLOAD_PURPOSES = ['certificat', 'preuve_affiliation'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Max 5 MB par fichier (FR-021). */
export const MAX_CONTENT_LENGTH_BYTES = 5 * 1024 * 1024;

/** Durée de validité d'une URL signée S3 (R8). */
export const UPLOAD_INTENT_TTL_SECONDS = 5 * 60;

export interface UploadIntent {
  readonly id: UploadIntentId;
  readonly conseillerComplianceId: ConseillerComplianceId;
  readonly purpose: UploadPurpose;
  readonly expectedContentType: AllowedMimeType;
  readonly expectedContentLength: number;
  readonly objectKey: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}
