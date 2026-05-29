// T120 — AdminIntakeController (US5).
//
// Routes admin :
//   GET  /api/intake/admin/unmatched              → file briefs > 4h sans match
//   GET  /api/intake/admin/briefs/:briefId        → détail brief avec PII
//   POST /api/intake/admin/briefs/:briefId/push-manual → push vers conseiller vérifié
//
// Guards :
//   AuthGuard (identite) — session admin valide
//   RoleGuard + @RequireRole('admin') — RBAC
//
// IdempotencyInterceptor global (AppModule) gère Idempotency-Key sur POST.

import { AdminPushManualSchema, type BriefSummary, type VoyageurBriefId } from '@cv/shared/intake';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../../identite/application/ports/auth-session-reader.port';
import { AuthGuard } from '../../../identite/interface/auth.guard';
import { RequireRole, RoleGuard } from '../../../identite/interface/role.guard';
import { VOYAGEUR_BRIEF_READER, type VoyageurBriefReader } from '../../application/ports';
import { ListUnmatchedBriefsUseCase } from '../../application/use-cases/list-unmatched-briefs.use-case';
import { PushBriefToConseillerUseCase } from '../../application/use-cases/push-brief-to-conseiller.use-case';
import { SkipRollingRenewal } from './skip-rolling-renewal.decorator';

interface RequestWithUser {
  user?: AuthenticatedUser;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@ApiTags('intake-admin')
@Controller('api/intake/admin')
@UseGuards(AuthGuard, RoleGuard)
@RequireRole('admin')
@SkipRollingRenewal()
export class AdminIntakeController {
  constructor(
    @Inject(ListUnmatchedBriefsUseCase)
    private readonly listUnmatched: ListUnmatchedBriefsUseCase,
    @Inject(PushBriefToConseillerUseCase)
    private readonly pushBriefToConseiller: PushBriefToConseillerUseCase,
    @Inject(VOYAGEUR_BRIEF_READER) private readonly briefReader: VoyageurBriefReader,
  ) {}

  // ---------------------------------------------------------------------
  // GET /api/intake/admin/unmatched (FR-026)
  // ---------------------------------------------------------------------
  @Get('unmatched')
  @ApiOperation({ summary: 'File briefs actifs > 4h sans match (FR-026)' })
  @ApiResponse({ status: 200, description: 'Liste paginée' })
  async listUnmatchedBriefs(
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ): Promise<{
    items: ReadonlyArray<BriefSummary>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        Number.parseInt(pageSizeRaw ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE,
      ),
    );
    return this.listUnmatched.execute({ page, pageSize });
  }

  // ---------------------------------------------------------------------
  // GET /api/intake/admin/briefs/:briefId (FR-027 — détail avec PII)
  // ---------------------------------------------------------------------
  @Get('briefs/:briefId')
  @ApiOperation({ summary: 'Détail brief admin (avec contact PII)' })
  @ApiResponse({ status: 200, description: 'BriefSummary' })
  @ApiResponse({ status: 404, description: 'Brief inexistant' })
  async getBriefDetail(@Param('briefId') briefId: string): Promise<BriefSummary> {
    const brief = await this.briefReader.findById(briefId as VoyageurBriefId);
    if (!brief) throw new NotFoundException();
    if (brief.status === 'anonymized') {
      throw new HttpException({ message: 'Brief anonymisé.' }, HttpStatus.GONE);
    }
    return {
      briefId: brief.id,
      voyageurContactId: brief.voyageurContactId,
      status: brief.status,
      submittedAt: brief.submittedAt.toISOString(),
      verifiedAt: brief.verifiedAt?.toISOString() ?? null,
      expiresAt: brief.expiresAt.toISOString(),
      destinations: brief.destinations,
      departureDate: brief.departureDate.toISOString().slice(0, 10),
      returnDate: brief.returnDate.toISOString().slice(0, 10),
      datesFlexible: brief.datesFlexible,
      datesFlexibilityDays: brief.datesFlexibilityDays,
      adultsCount: brief.adultsCount,
      childrenAges: brief.childrenAges,
      infantsCount: brief.infantsCount,
      budgetRange: brief.budgetRange,
      conseillerLanguage: brief.conseillerLanguage,
      conseillerLanguageOther: brief.conseillerLanguageOther,
      speciality: brief.speciality,
      specialityOther: brief.specialityOther,
      familiarity: brief.familiarity,
    };
  }

  // ---------------------------------------------------------------------
  // POST /api/intake/admin/briefs/:briefId/push-manual (FR-027 + FR-028)
  // ---------------------------------------------------------------------
  @Post('briefs/:briefId/push-manual')
  @ApiOperation({ summary: 'Push manuel vers conseiller vérifié (FR-027)' })
  @ApiResponse({ status: 200, description: 'Outbox publié, audit créé' })
  @ApiResponse({ status: 400, description: 'Conseiller non-vérifié ou motif invalide' })
  @ApiResponse({ status: 404, description: 'Brief inexistant' })
  async pushManual(
    @Param('briefId') briefId: string,
    @Body(new ZodValidationPipe(AdminPushManualSchema))
    body: { conseillerComplianceId: string; reason: string },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: RequestWithUser,
  ): Promise<{ status: 'ok' }> {
    const adminUserId = req.user?.id;
    if (!adminUserId)
      throw new HttpException({ message: 'Auth missing.' }, HttpStatus.UNAUTHORIZED);

    const result = await this.pushBriefToConseiller.execute({
      briefId: briefId as VoyageurBriefId,
      conseillerComplianceId: body.conseillerComplianceId,
      reason: body.reason,
      adminUserId,
      idempotencyKey: idempotencyKey ?? null,
    });

    if (result.kind === 'invalid_reason') {
      throw new HttpException(
        { message: 'Motif invalide (20-500 chars).' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (result.kind === 'conseiller_not_verified') {
      throw new HttpException(
        { message: 'Conseiller non-vérifié — push refusé.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (result.kind === 'brief_not_found') throw new NotFoundException();
    if (result.kind === 'brief_anonymized') {
      throw new HttpException({ message: 'Brief anonymisé.' }, HttpStatus.GONE);
    }
    return { status: 'ok' };
  }
}
