// T081 — AdminMatchingController : POST /api/matching/admin/briefs/:briefId/re-match.
//
// Sécurité (Principe IX) :
//   - AuthGuard (identité) — session admin valide
//   - RoleGuard + @RequireRole('admin') — RBAC strict
//   - Idempotency-Key header obligatoire (Principe X)
//   - Zod validation body (reason 10-500 chars)
//
// Pattern hérité de AdminIntakeController (feature 008 US5).

import {
  type AdminRematchRequest,
  AdminRematchRequestSchema,
  type AdminRematchResponse,
} from '@cv/shared/matching';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { AuthGuard } from '../../../identite/interface/auth.guard';
import { RequireRole, RoleGuard } from '../../../identite/interface/role.guard';
import { TriggerRematchUseCase } from '../../application/use-cases/trigger-rematch.use-case';

interface AuthenticatedReq {
  user?: { id: string };
}

@ApiTags('matching-admin')
@Controller('api/matching/admin')
@UseGuards(AuthGuard, RoleGuard)
@RequireRole('admin')
export class AdminMatchingController {
  constructor(
    @Inject(TriggerRematchUseCase)
    private readonly triggerRematch: TriggerRematchUseCase,
  ) {}

  @Post('briefs/:briefId/re-match')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-matching manuel après révocation cascade (FR-016)' })
  @ApiResponse({ status: 200, description: 'Nouveau MatchingResult créé' })
  @ApiResponse({ status: 400, description: 'Reason invalide (Zod 10-500 chars)' })
  @ApiResponse({ status: 401, description: 'Session admin absente' })
  @ApiResponse({ status: 403, description: 'Rôle non admin' })
  @ApiResponse({ status: 404, description: 'briefId inexistant OU jamais matché' })
  @ApiResponse({ status: 409, description: 'Re-matching déjà en cours (verrou Redis)' })
  @ApiResponse({ status: 422, description: 'Brief inactif (pending_verification ou anonymisé)' })
  async rematch(
    @Param('briefId', new ParseUUIDPipe({ version: '4' })) briefId: string,
    @Body(new ZodValidationPipe(AdminRematchRequestSchema)) body: AdminRematchRequest,
    @Req() req: AuthenticatedReq,
  ): Promise<AdminRematchResponse> {
    const adminUserId = req.user?.id;
    if (!adminUserId) {
      // AuthGuard devrait avoir bloqué — mais défense en profondeur.
      throw new BadRequestException('Session admin invalide');
    }

    const result = await this.triggerRematch.execute({
      briefId,
      adminUserId,
      reason: body.reason,
    });

    if (result.kind === 'lock_in_progress') {
      throw new ConflictException({
        code: 'RE_MATCH_IN_PROGRESS',
        message:
          'Un re-matching est déjà en cours pour ce brief, réessayez dans quelques secondes.',
      });
    }
    if (result.kind === 'brief_not_found') {
      throw new NotFoundException({
        code: 'BRIEF_NOT_FOUND',
        message: 'Brief inexistant ou anonymisé Loi 25.',
      });
    }
    if (result.kind === 'no_previous_result') {
      throw new UnprocessableEntityException({
        code: 'BRIEF_NOT_ACTIVE',
        message:
          'Aucun MatchingResult préalable. Le re-matching nécessite un brief actif déjà matché.',
      });
    }

    return {
      newMatchingResultId: result.newMatchingResultId,
      previousMatchingResultId: result.previousMatchingResultId,
      status: result.status,
      matchedCount: result.matchedCount,
      computedAt: new Date().toISOString(),
    };
  }
}
