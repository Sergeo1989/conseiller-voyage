// T071 — AdminConformiteController.
// Endpoints exposés aux admins authentifiés pour la revue des dossiers.
//
// Routes :
//   GET   /api/conformite/admin/queue             → file paginée
//   GET   /api/conformite/admin/submissions/:id   → détail d'un dossier
//   POST  /api/conformite/admin/submissions/:id/approve  → approuve
//   POST  /api/conformite/admin/submissions/:id/refuse   → refuse
//
// Cf. specs/001-conformite-module/contracts/http-endpoints.md.

import type { AdminId, SubmissionId } from '@cv/shared/conformite';
import {
  AdminIdSchema,
  ApproveSubmissionSchema,
  type DeclarePermitRevokedResponse,
  DeclarePermitRevokedSchema,
  QueueQuerySchema,
  RefuseSubmissionSchema,
  SubmissionIdSchema,
} from '@cv/shared/conformite';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
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
import {
  DOCUMENT_STORAGE,
  type DocumentStoragePort,
} from '../../application/ports/document-storage.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { ApproveDossierUseCase } from '../../application/use-cases/approve-dossier.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { DeclarePermitRevokedUseCase } from '../../application/use-cases/declare-permit-revoked.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { RefuseDossierUseCase } from '../../application/use-cases/refuse-dossier.use-case';
import type {
  ApproveSubmissionRequestDto,
  QueueQueryDto,
  QueueResponseDto,
  RefuseSubmissionRequestDto,
  SubmissionDetailResponseDto,
} from './dto/admin.dto';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@ApiTags('conformite-admin')
@Controller('api/conformite/admin')
@UseGuards(AuthGuard)
export class AdminConformiteController {
  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    private readonly approveDossier: ApproveDossierUseCase,
    private readonly refuseDossier: RefuseDossierUseCase,
    private readonly declarePermit: DeclarePermitRevokedUseCase,
  ) {}

  @ApiOperation({ summary: 'File de revue paginée (FR-003).' })
  @ApiResponse({ status: 200, description: 'Liste des soumissions filtrées par statut.' })
  @ApiResponse({ status: 401, description: 'Session absente ou role !== admin.' })
  @Get('queue')
  async getQueue(
    @Req() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(QueueQuerySchema)) query: QueueQueryDto,
  ): Promise<QueueResponseDto> {
    this.assertAdmin(req);
    const result = await this.reader.listSubmissions({
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      items: result.items.map((s) => ({
        submissionId: s.id,
        conseillerComplianceId: s.conseillerComplianceId,
        submittedAt: s.submittedAt.toISOString(),
        status: s.status,
      })),
      totalCount: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  @ApiOperation({
    summary: "Détail d'une soumission + URLs S3 GET signées (R5 attachment).",
  })
  @ApiResponse({ status: 200, description: 'Soumission complète prête à examiner.' })
  @ApiResponse({ status: 404, description: 'Soumission introuvable.' })
  @Get('submissions/:submissionId')
  async getSubmissionDetail(
    @Req() req: AuthenticatedRequest,
    @Param('submissionId') rawSubmissionId: string,
  ): Promise<SubmissionDetailResponseDto> {
    this.assertAdmin(req);
    const submissionId = this.parseSubmissionId(rawSubmissionId);
    const submission = await this.reader.findSubmission(submissionId);
    if (!submission) {
      throw new NotFoundException('Soumission introuvable.');
    }
    const [certs, affils] = await Promise.all([
      this.reader.listCertificatsForSubmission(submissionId),
      this.reader.listAffiliationsForSubmission(submissionId),
    ]);
    // Génère les URLs signées GET (5 min, Content-Disposition: attachment R5)
    const [certUrls, affilUrls] = await Promise.all([
      Promise.all(
        certs.map((c) =>
          this.storage.presignDownload(c.documentObjectKey, { forceDownload: true }),
        ),
      ),
      Promise.all(
        affils.map((a) => this.storage.presignDownload(a.proofObjectKey, { forceDownload: true })),
      ),
    ]);
    return {
      submissionId: submission.id,
      conseillerComplianceId: submission.conseillerComplianceId,
      submittedAt: submission.submittedAt.toISOString(),
      status: submission.status,
      decidedAt: submission.decidedAt?.toISOString() ?? null,
      decisionReason: submission.decisionReason,
      certificates: certs.map((c, i) => ({
        id: c.id,
        province: c.province,
        certificateNumber: c.certificateNumber,
        issuedAt: c.issuedAt.toISOString(),
        expiresAt: c.expiresAt.toISOString(),
        decision: c.decision,
        documentDownloadUrl: certUrls[i] ?? '',
      })),
      affiliations: affils.map((a, i) => ({
        id: a.id,
        agencyName: a.agencyName,
        agencyPermitNumber: a.agencyPermitNumber,
        agencyProvince: a.agencyProvince,
        decision: a.decision,
        proofDownloadUrl: affilUrls[i] ?? '',
      })),
    };
  }

  @ApiOperation({ summary: 'Approuve une soumission (US1, FR-004).' })
  @ApiResponse({ status: 200, description: 'Soumission approuvée, statut conformité recalculé.' })
  @ApiResponse({ status: 409, description: 'Soumission déjà décidée.' })
  @Post('submissions/:submissionId/approve')
  @HttpCode(HttpStatus.OK)
  async approve(
    @Req() req: AuthenticatedRequest,
    @Param('submissionId') rawSubmissionId: string,
    @Body(new ZodValidationPipe(ApproveSubmissionSchema)) body: ApproveSubmissionRequestDto,
  ): Promise<{ ok: true }> {
    const admin = this.assertAdmin(req);
    const submissionId = this.parseSubmissionId(rawSubmissionId);
    await this.approveDossier.execute({
      requestedBy: { id: admin.id, role: 'admin' },
      submissionId,
      comment: body.comment ?? null,
    });
    return { ok: true };
  }

  @ApiOperation({ summary: 'Refuse une soumission avec motif ≥ 20 chars (FR-004).' })
  @ApiResponse({ status: 200, description: 'Soumission refusée, conseiller peut re-soumettre.' })
  @ApiResponse({ status: 400, description: 'Motif < 20 caractères.' })
  @ApiResponse({ status: 409, description: 'Soumission déjà décidée.' })
  @Post('submissions/:submissionId/refuse')
  @HttpCode(HttpStatus.OK)
  async refuse(
    @Req() req: AuthenticatedRequest,
    @Param('submissionId') rawSubmissionId: string,
    @Body(new ZodValidationPipe(RefuseSubmissionSchema)) body: RefuseSubmissionRequestDto,
  ): Promise<{ ok: true }> {
    const admin = this.assertAdmin(req);
    const submissionId = this.parseSubmissionId(rawSubmissionId);
    await this.refuseDossier.execute({
      requestedBy: { id: admin.id, role: 'admin' },
      submissionId,
      reason: body.reason,
    });
    return { ok: true };
  }

  @ApiOperation({ summary: 'Déclare un retrait de permis avec cascade (FR-015 / US3).' })
  @ApiResponse({ status: 200, description: 'Permis révoqué, cascade appliquée.' })
  @ApiResponse({ status: 400, description: 'Motif < 20 caractères.' })
  @ApiResponse({ status: 409, description: 'Permis déjà révoqué.' })
  @Post('permits/revoke')
  @HttpCode(HttpStatus.OK)
  async revokePermit(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(DeclarePermitRevokedSchema))
    body: import('@cv/shared/conformite').DeclarePermitRevokedBody,
  ): Promise<DeclarePermitRevokedResponse> {
    const admin = this.assertAdmin(req);
    return this.declarePermit.execute({
      requestedBy: { id: admin.id, role: 'admin' },
      agencyPermitNumber: body.agencyPermitNumber,
      agencyProvince: body.agencyProvince,
      reason: body.reason,
    });
  }

  // --- Helpers privés ---

  private assertAdmin(req: AuthenticatedRequest): { id: AdminId; role: 'admin' } {
    const user = req.user;
    if (!user) {
      throw new UnauthorizedException('Session manquante.');
    }
    if (user.role !== 'admin') {
      throw new UnauthorizedException('Cette ressource est réservée aux admins.');
    }
    return {
      id: AdminIdSchema.parse(user.id),
      role: 'admin',
    };
  }

  private parseSubmissionId(raw: string): SubmissionId {
    const parsed = SubmissionIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new NotFoundException('Soumission introuvable (ID invalide).');
    }
    return parsed.data;
  }
}
