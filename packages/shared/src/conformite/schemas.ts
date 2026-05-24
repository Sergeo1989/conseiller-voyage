// T067 — Schémas Zod API du module conformité.
// Partagés entre apps/api (validation côté NestJS via ZodValidationPipe T023)
// et apps/web (Server Actions + react-hook-form resolver).
//
// Tous les schémas tirent leurs messages d'erreur de la map FR-CA
// (T030f — packages/shared/conformite/zod-errors.ts).
//
// Cf. specs/001-conformite-module/contracts/http-endpoints.md.

import { z } from 'zod';

// --- Enums partagés (alignés avec domain VOs côté apps/api) ---

export const ProvinceSchema = z.enum(['QC', 'ON']);
export type Province = z.infer<typeof ProvinceSchema>;

export const UploadPurposeSchema = z.enum(['certificat', 'preuve_affiliation']);
export type UploadPurpose = z.infer<typeof UploadPurposeSchema>;

export const AllowedMimeTypeSchema = z.enum([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
]);
export type AllowedMimeType = z.infer<typeof AllowedMimeTypeSchema>;

export const ConformiteStatusSchema = z.enum(['pending', 'verified', 'suspended', 'revoked']);
export type ConformiteStatusValue = z.infer<typeof ConformiteStatusSchema>;

export const SubmissionStatusSchema = z.enum(['pending', 'approved', 'refused']);
export type SubmissionStatusValue = z.infer<typeof SubmissionStatusSchema>;

// --- Constantes partagées (FR-021) ---

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_CERTIFICATES = 2;
export const MAX_AFFILIATIONS = 5;
export const MAX_FILES_PER_UPLOAD_REQUEST = 5;
export const MIN_REFUSAL_REASON_CHARS = 20;
export const MAX_REFUSAL_REASON_CHARS = 2000;
export const MAX_COMMENT_CHARS = 500;

// --- POST /me/upload-urls ---

export const RequestUploadUrlsSchema = z
  .object({
    files: z
      .array(
        z
          .object({
            purpose: UploadPurposeSchema,
            contentType: AllowedMimeTypeSchema,
            contentLength: z
              .number()
              .int()
              .positive()
              .max(
                MAX_UPLOAD_BYTES,
                `Fichier trop volumineux (max ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo).`,
              ),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_FILES_PER_UPLOAD_REQUEST),
  })
  .strict();
export type RequestUploadUrlsBody = z.infer<typeof RequestUploadUrlsSchema>;

export const RequestUploadUrlsResponseSchema = z
  .object({
    uploads: z.array(
      z
        .object({
          uploadId: z.string().uuid(),
          presignedUrl: z.string().url(),
          expiresAt: z.string().datetime(),
          requiredHeaders: z.record(z.string()),
        })
        .strict(),
    ),
  })
  .strict();
export type RequestUploadUrlsResponse = z.infer<typeof RequestUploadUrlsResponseSchema>;

// --- POST /me/submissions ---

export const SubmitDossierCertificateSchema = z
  .object({
    province: ProvinceSchema,
    certificateNumber: z.string().min(1).max(50),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    documentUploadId: z.string().uuid(),
  })
  .strict()
  .refine((cert) => new Date(cert.expiresAt) > new Date(cert.issuedAt), {
    message: "La date d'expiration doit être strictement postérieure à la date d'émission.",
    path: ['expiresAt'],
  });

export const SubmitDossierAffiliationSchema = z
  .object({
    agencyName: z.string().min(1).max(200),
    agencyPermitNumber: z.string().min(1).max(50),
    agencyProvince: ProvinceSchema,
    proofUploadId: z.string().uuid(),
    role: z.string().max(100).optional(),
    activeSince: z.string().datetime().optional(),
  })
  .strict();

export const SubmitDossierSchema = z
  .object({
    consentGiven: z.literal(true, {
      errorMap: () => ({ message: 'Le consentement explicite est obligatoire (FR-016).' }),
    }),
    certificates: z.array(SubmitDossierCertificateSchema).min(1).max(MAX_CERTIFICATES),
    affiliations: z.array(SubmitDossierAffiliationSchema).min(1).max(MAX_AFFILIATIONS),
  })
  .strict();
export type SubmitDossierBody = z.infer<typeof SubmitDossierSchema>;

export const SubmitDossierResponseSchema = z
  .object({
    submissionId: z.string().uuid(),
    status: SubmissionStatusSchema,
  })
  .strict();
export type SubmitDossierResponse = z.infer<typeof SubmitDossierResponseSchema>;

// --- GET /me ---

export const ConseillerDossierViewSchema = z
  .object({
    conseillerComplianceId: z.string().uuid(),
    status: ConformiteStatusSchema,
    lastVerifiedAt: z.string().datetime().nullable(),
    lastStatusChangeAt: z.string().datetime(),
    consentToProcessGivenAt: z.string().datetime().nullable(),
    certificates: z.array(
      z
        .object({
          id: z.string().uuid(),
          province: ProvinceSchema,
          certificateNumber: z.string(),
          issuedAt: z.string().datetime(),
          expiresAt: z.string().datetime(),
          decision: SubmissionStatusSchema,
        })
        .strict(),
    ),
    affiliations: z.array(
      z
        .object({
          id: z.string().uuid(),
          agencyName: z.string(),
          agencyPermitNumber: z.string(),
          agencyProvince: ProvinceSchema,
          decision: SubmissionStatusSchema,
          inactivatedAt: z.string().datetime().nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type ConseillerDossierView = z.infer<typeof ConseillerDossierViewSchema>;

// --- GET /admin/queue ---

export const QueueQuerySchema = z
  .object({
    status: SubmissionStatusSchema.default('pending'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export type QueueQuery = z.infer<typeof QueueQuerySchema>;

export const QueueResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          submissionId: z.string().uuid(),
          conseillerComplianceId: z.string().uuid(),
          submittedAt: z.string().datetime(),
          status: SubmissionStatusSchema,
        })
        .strict(),
    ),
    totalCount: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  })
  .strict();
export type QueueResponse = z.infer<typeof QueueResponseSchema>;

// --- GET /admin/submissions/:id ---

export const SubmissionDetailSchema = z
  .object({
    submissionId: z.string().uuid(),
    conseillerComplianceId: z.string().uuid(),
    submittedAt: z.string().datetime(),
    status: SubmissionStatusSchema,
    decidedAt: z.string().datetime().nullable(),
    decisionReason: z.string().nullable(),
    certificates: z.array(
      z
        .object({
          id: z.string().uuid(),
          province: ProvinceSchema,
          certificateNumber: z.string(),
          issuedAt: z.string().datetime(),
          expiresAt: z.string().datetime(),
          decision: SubmissionStatusSchema,
          documentDownloadUrl: z.string().url(),
        })
        .strict(),
    ),
    affiliations: z.array(
      z
        .object({
          id: z.string().uuid(),
          agencyName: z.string(),
          agencyPermitNumber: z.string(),
          agencyProvince: ProvinceSchema,
          decision: SubmissionStatusSchema,
          proofDownloadUrl: z.string().url(),
        })
        .strict(),
    ),
  })
  .strict();
export type SubmissionDetail = z.infer<typeof SubmissionDetailSchema>;

// --- POST /admin/submissions/:id/approve ---

export const ApproveSubmissionSchema = z
  .object({
    comment: z.string().max(MAX_COMMENT_CHARS).optional(),
  })
  .strict();
export type ApproveSubmissionBody = z.infer<typeof ApproveSubmissionSchema>;

// --- POST /admin/submissions/:id/refuse ---

export const RefuseSubmissionSchema = z
  .object({
    reason: z
      .string()
      .min(
        MIN_REFUSAL_REASON_CHARS,
        `Motif obligatoire d'au moins ${MIN_REFUSAL_REASON_CHARS} caractères (FR-004).`,
      )
      .max(MAX_REFUSAL_REASON_CHARS),
  })
  .strict();
export type RefuseSubmissionBody = z.infer<typeof RefuseSubmissionSchema>;

// --- Path params ---

export const SubmissionIdParamSchema = z
  .object({
    submissionId: z.string().uuid(),
  })
  .strict();
export type SubmissionIdParam = z.infer<typeof SubmissionIdParamSchema>;

// --- US3 POST /admin/permits/revoke ---

export const DeclarePermitRevokedSchema = z
  .object({
    agencyPermitNumber: z.string().min(1).max(50),
    agencyProvince: ProvinceSchema,
    reason: z
      .string()
      .min(
        MIN_REFUSAL_REASON_CHARS,
        `Motif obligatoire d'au moins ${MIN_REFUSAL_REASON_CHARS} caractères (FR-015).`,
      )
      .max(MAX_REFUSAL_REASON_CHARS),
  })
  .strict();
export type DeclarePermitRevokedBody = z.infer<typeof DeclarePermitRevokedSchema>;

export const DeclarePermitRevokedResponseSchema = z
  .object({
    permitRevocationId: z.string().uuid(),
    affectedConseillerCount: z.number().int().nonnegative(),
    conseillerSuspensionCount: z.number().int().nonnegative(),
  })
  .strict();
export type DeclarePermitRevokedResponse = z.infer<typeof DeclarePermitRevokedResponseSchema>;
