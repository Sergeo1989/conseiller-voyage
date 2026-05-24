// T070 — ConseillerConformiteController.
// Endpoints exposés au conseiller authentifié pour gérer son dossier
// de conformité.
//
// Routes :
//   POST   /api/conformite/me/upload-urls     → demande N URLs signées S3
//   POST   /api/conformite/me/submissions     → soumet un dossier
//   GET    /api/conformite/me                 → lit son dossier
//
// Garanties transversales déjà appliquées globalement :
//   - AuthGuard (T019) : session valide obligatoire
//   - CsrfProtectionMiddleware (T021) : header X-Requested-By sur mutations
//   - IdempotencyInterceptor (T020) : Idempotency-Key respecté sur POST
//   - Security headers (T022), Throttler (T024), Zod validation (T023)
//
// Cf. specs/001-conformite-module/contracts/http-endpoints.md.

import type { AuditPageResponse, ConseillerId } from '@cv/shared/conformite';
import {
  AuditQuerySchema,
  ConseillerIdSchema,
  RequestUploadUrlsSchema,
  SubmitDossierSchema,
} from '@cv/shared/conformite';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../../identite/application/ports/auth-session-reader.port';
import { AuthGuard } from '../../../identite/interface/auth.guard';
import {
  CONFORMITE_READER,
  type ConformiteReader,
} from '../../application/ports/conformite-reader.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { RequestUploadUrlsUseCase } from '../../application/use-cases/request-upload-urls.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { SubmitDossierUseCase } from '../../application/use-cases/submit-dossier.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { ViewConseillerDossierUseCase } from '../../application/use-cases/view-conseiller-dossier.use-case';
import type {
  GetConseillerDossierResponseDto,
  RequestUploadUrlsRequestDto,
  RequestUploadUrlsResponseDto,
  SubmitDossierRequestDto,
  SubmitDossierResponseDto,
} from './dto/conseiller.dto';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@ApiTags('conformite-conseiller')
@Controller('api/conformite/me')
@UseGuards(AuthGuard)
export class ConseillerConformiteController {
  constructor(
    private readonly requestUploadUrls: RequestUploadUrlsUseCase,
    private readonly submitDossier: SubmitDossierUseCase,
    private readonly viewDossier: ViewConseillerDossierUseCase,
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
  ) {}

  @ApiOperation({
    summary: 'Demande N URLs signées S3 pour téléverser les documents avant soumission (B2).',
  })
  @ApiResponse({ status: 200, description: 'URLs générées + UploadIntents persistés.' })
  @ApiResponse({ status: 400, description: 'Validation Zod échouée (FR-021).' })
  @ApiResponse({ status: 401, description: 'Session absente ou role !== conseiller.' })
  @Post('upload-urls')
  @HttpCode(HttpStatus.OK)
  async postUploadUrls(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(RequestUploadUrlsSchema))
    body: RequestUploadUrlsRequestDto,
  ): Promise<RequestUploadUrlsResponseDto> {
    const user = this.assertConseiller(req);
    const result = await this.requestUploadUrls.execute({
      requestedBy: { id: user.id, role: user.role },
      files: body.files,
    });
    return {
      uploads: result.uploads.map((u) => ({
        uploadId: u.uploadId,
        presignedUrl: u.presignedUrl,
        expiresAt: u.expiresAt.toISOString(),
        requiredHeaders: u.requiredHeaders,
      })),
    };
  }

  @ApiOperation({ summary: 'Soumet un dossier complet (US1, FR-001/FR-016/FR-021).' })
  @ApiResponse({ status: 201, description: 'Dossier accepté, en attente de revue admin.' })
  @ApiResponse({ status: 400, description: 'Validation Zod ou UploadIntent invalide.' })
  @ApiResponse({ status: 401, description: 'Session absente ou role !== conseiller.' })
  @Post('submissions')
  @HttpCode(HttpStatus.CREATED)
  async postSubmission(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(SubmitDossierSchema))
    body: SubmitDossierRequestDto,
  ): Promise<SubmitDossierResponseDto> {
    const user = this.assertConseiller(req);
    const result = await this.submitDossier.execute({
      requestedBy: { id: user.id, role: user.role },
      dossier: {
        consentGiven: body.consentGiven,
        certificates: body.certificates.map((c) => ({
          province: c.province,
          certificateNumber: c.certificateNumber,
          issuedAt: new Date(c.issuedAt),
          expiresAt: new Date(c.expiresAt),
          documentUploadId: c.documentUploadId,
        })),
        affiliations: body.affiliations.map((a) => ({
          agencyName: a.agencyName,
          agencyPermitNumber: a.agencyPermitNumber,
          agencyProvince: a.agencyProvince,
          proofUploadId: a.proofUploadId,
          ...(a.role !== undefined && { role: a.role }),
          ...(a.activeSince !== undefined && { activeSince: new Date(a.activeSince) }),
        })),
      },
    });
    return { submissionId: result.submissionId, status: 'pending' };
  }

  @ApiOperation({ summary: 'Lit le dossier du conseiller authentifié (US5, FR-013).' })
  @ApiResponse({ status: 200, description: 'Dossier complet (statut, certs, affils).' })
  @ApiResponse({ status: 404, description: 'Aucun dossier en DB pour ce conseiller.' })
  @Get()
  async getDossier(@Req() req: AuthenticatedRequest): Promise<GetConseillerDossierResponseDto> {
    const user = this.assertConseiller(req);
    const compliance = await this.reader.findComplianceByConseillerId(user.id);
    if (!compliance) {
      throw new NotFoundException('Aucun dossier de conformité trouvé.');
    }
    const [certificats, affiliations] = await Promise.all([
      this.reader.listCertificatsForCompliance(compliance.id),
      this.reader.listAffiliationsForCompliance(compliance.id),
    ]);
    return {
      conseillerComplianceId: compliance.id,
      status: compliance.status,
      lastVerifiedAt: compliance.lastVerifiedAt?.toISOString() ?? null,
      lastStatusChangeAt: compliance.lastStatusChangeAt.toISOString(),
      consentToProcessGivenAt: compliance.consentToProcessGivenAt?.toISOString() ?? null,
      certificates: certificats.map((c) => ({
        id: c.id,
        province: c.province,
        certificateNumber: c.certificateNumber,
        issuedAt: c.issuedAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
        decision: c.decision,
      })),
      affiliations: affiliations.map((a) => ({
        id: a.id,
        agencyName: a.agencyName,
        agencyPermitNumber: a.agencyPermitNumber,
        agencyProvince: a.agencyProvince,
        decision: a.decision,
        inactivatedAt: a.inactivatedAt?.toISOString() ?? null,
      })),
    };
  }

  @ApiOperation({ summary: 'Historique audit paginé (US5 FR-013).' })
  @ApiResponse({ status: 200, description: 'Page audit antichronologique avec nextCursor.' })
  @Get('audit')
  async getAudit(
    @Req() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(AuditQuerySchema))
    query: import('@cv/shared/conformite').AuditQuery,
  ): Promise<AuditPageResponse> {
    const user = this.assertConseiller(req);
    const result = await this.viewDossier.execute({
      requestedBy: { id: user.id, role: user.role },
      auditCursor: query.cursor ?? null,
      auditPageSize: query.pageSize,
    });
    return {
      items: result.audit.items.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        actorRole: e.actorRole,
        occurredAt: e.occurredAt.toISOString(),
        payload: e.payload,
      })),
      nextCursor: result.audit.nextCursor,
    };
  }

  /**
   * Vérifie que l'utilisateur authentifié est un conseiller et retourne
   * son ID brandé. Le RBAC fin est ensuite re-vérifié dans chaque use
   * case (défense en profondeur Principe IX).
   */
  private assertConseiller(req: AuthenticatedRequest): {
    id: ConseillerId;
    role: 'conseiller';
  } {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Session manquante.');
    }
    if (user.role !== 'conseiller') {
      throw new UnauthorizedException('Cette ressource est réservée aux conseillers.');
    }
    return {
      id: ConseillerIdSchema.parse(user.id),
      role: 'conseiller',
    };
  }
}
