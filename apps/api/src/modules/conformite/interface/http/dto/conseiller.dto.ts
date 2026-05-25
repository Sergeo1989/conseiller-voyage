// T068 — DTOs ConseillerConformiteController.
// Type aliases re-exportés depuis packages/shared/conformite/schemas.ts.
// Pas de class DTO + class-validator : on utilise ZodValidationPipe (T023)
// + Zod schemas partagés front/back pour la cohérence (Stack v2.1.0).
//
// Les annotations Swagger (T073) sont posées au niveau du contrôleur
// avec @ApiBody/@ApiResponse pointant vers ces types via la conversion
// schéma Zod → OpenAPI faite dans ConformiteModule.

export type {
  ConseillerDossierView as GetConseillerDossierResponseDto,
  RequestUploadUrlsBody as RequestUploadUrlsRequestDto,
  RequestUploadUrlsResponse as RequestUploadUrlsResponseDto,
  SubmitDossierBody as SubmitDossierRequestDto,
  SubmitDossierResponse as SubmitDossierResponseDto,
} from '@cv/shared/conformite';
