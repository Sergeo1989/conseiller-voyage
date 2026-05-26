// T115 — AdminUserInvitationController (US7 P2).
//
// POST /admin/users — admin authentifié + StepUp + Idempotency-Key.

import { type InviteAdminDto, InviteAdminDtoSchema } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { readActorIp } from '../../../common/actor-ip.util';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../application/ports/auth-session-reader.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { InviteAdminUseCase } from '../application/use-cases/invite-admin.use-case';
import { AuthGuard } from './auth.guard';
import { RequireRole, RoleGuard } from './role.guard';
import { StepUpGuard } from './step-up.guard';

interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  ip?: string;
}

@ApiTags('admin-user-invitation')
@Controller('admin')
@UseGuards(AuthGuard, RoleGuard, StepUpGuard)
@RequireRole('admin')
export class AdminUserInvitationController {
  constructor(private readonly inviteUseCase: InviteAdminUseCase) {}

  @Post('users')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Invitation d'un nouvel admin par un admin existant (US7)" })
  @ApiResponse({ status: 202, description: 'Invitation envoyée + outbox' })
  @ApiResponse({ status: 400, description: 'SELF_INVITATION_FORBIDDEN' })
  @ApiResponse({
    status: 409,
    description: 'TARGET_EMAIL_ALREADY_REGISTERED ou INVITATION_ALREADY_ACTIVE',
  })
  async invite(
    @Body(new ZodValidationPipe(InviteAdminDtoSchema)) body: InviteAdminDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{
    readonly status: 'ok';
    readonly invitationId: string;
    readonly expiresAt: string;
  }> {
    const actor = req.user;
    if (!actor) throw new UnauthorizedException();
    const profile = await prisma.authUser.findUnique({
      where: { id: actor.id },
      select: { name: true },
    });
    const actorIp = readActorIp(req);
    const result = await this.inviteUseCase.execute({
      actor: { id: actor.id, email: actor.email ?? null, name: profile?.name ?? null },
      targetEmailRaw: body.targetEmail,
      ...(actorIp ? { actorIp } : {}),
    });
    return {
      status: 'ok',
      invitationId: result.invitationId,
      expiresAt: result.expiresAt.toISOString(),
    };
  }
}
