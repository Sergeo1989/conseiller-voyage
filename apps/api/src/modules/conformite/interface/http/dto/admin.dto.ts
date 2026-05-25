// T069 — DTOs AdminConformiteController.
// Type aliases re-exportés depuis packages/shared/conformite/schemas.ts.
// Cf. note de conseiller.dto.ts sur l'absence volontaire de class-validator.

export type {
  ApproveSubmissionBody as ApproveSubmissionRequestDto,
  QueueQuery as QueueQueryDto,
  QueueResponse as QueueResponseDto,
  RefuseSubmissionBody as RefuseSubmissionRequestDto,
  SubmissionDetail as SubmissionDetailResponseDto,
  SubmissionIdParam as SubmissionIdParamDto,
} from '@cv/shared/conformite';
