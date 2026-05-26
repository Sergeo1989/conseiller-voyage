// MfaAdminResetController — US4 P2 (reset MFA admin).
// Routes :
//   POST /api/mfa/admin/reset             → reset MFA target user
//   GET  /api/admin/active-admins-count   → compteur observable
//
// Sécurité :
//   - AuthGuard : session valide
//   - RoleGuard('admin') : seul un admin peut reset
//   - StepUpGuard : exige session MFA-frais < 30 min
//   - IdempotencyInterceptor (Redis, infra commune 001) : replay safe
//     via header Idempotency-Key

import { prisma } from '@cv/db';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../application/ports/auth-session-reader.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { CountActiveAdminsUseCase } from '../application/use-cases/count-active-admins.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { ResetMfaAdminUseCase } from '../application/use-cases/reset-mfa-admin.use-case';
import { AuthGuard } from './auth.guard';
import {
  type ActiveAdminsCountResponseDto,
  type AdminResetRequestDto,
  AdminResetRequestSchema,
  type AdminResetResponseDto,
} from './dto/admin-reset.dto';
import { RequireRole, RoleGuard } from './role.guard';
import { StepUpGuard } from './step-up.guard';

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

function readActorIp(req: AuthenticatedRequest): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0]?.trim();
    if (first) return abridgeIp(first);
  }
  if (req.ip) return abridgeIp(req.ip);
  return undefined;
}

function abridgeIp(ip: string): string {
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 3).join(':')}::`;
  }
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts.slice(0, 3).join('.')}.0`;
  return ip;
}

@ApiTags('mfa-admin')
@Controller('api')
@UseGuards(AuthGuard, RoleGuard)
@RequireRole('admin')
export class MfaAdminResetController {
  constructor(
    private readonly resetUseCase: ResetMfaAdminUseCase,
    private readonly countAdminsUseCase: CountActiveAdminsUseCase,
  ) {}

  @Post('mfa/admin/reset')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset MFA d un utilisateur cible (US4)' })
  @ApiResponse({ status: 200, description: 'Reset effectué' })
  @ApiResponse({ status: 400, description: 'SELF_RESET_FORBIDDEN' })
  @ApiResponse({ status: 404, description: 'TARGET_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'TARGET_NOT_ENROLLED' })
  async reset(
    @Body(new ZodValidationPipe(AdminResetRequestSchema)) body: AdminResetRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AdminResetResponseDto> {
    const user = req.user;
    if (!user) throw new UnauthorizedException();

    // Lookup nom de l'admin acteur pour traçabilité pair-à-pair
    // (FR-026 affichage côté admin cible).
    const actorRow = await prisma.authUser.findUnique({
      where: { id: user.id },
      select: { name: true },
    });

    const actorIp = readActorIp(req);
    const result = await this.resetUseCase.execute({
      actor: {
        id: user.id,
        role: user.role,
        name: actorRow?.name ?? null,
      },
      targetUserId: body.targetUserId,
      justification: body.justification,
      idempotencyKey: body.idempotencyKey,
      ...(actorIp ? { actorIp } : {}),
    });

    // Invalide le cache compteur si la cible était admin.
    if (result.targetRole === 'admin') {
      this.countAdminsUseCase.invalidate();
    }

    return {
      resetAt: result.resetAt.toISOString(),
      sessionsRevokedCount: result.sessionsRevokedCount,
      warningDisplayedLastAdmin: result.warningDisplayedLastAdmin,
    };
  }

  @Get('admin/active-admins-count')
  @ApiOperation({ summary: 'Compteur d admins actifs (cache 60s, R10)' })
  async activeAdminsCount(): Promise<ActiveAdminsCountResponseDto> {
    return { activeAdminsCount: await this.countAdminsUseCase.execute() };
  }
}
