// T116 — AuthAdminInvitationController (US7 P2 — endpoints invité).
//
// POST /api/auth/admin-invitation/validate — pré-vérif token (pure read)
// POST /api/auth/admin-invitation/consume  — crée user + account
// Public (token JWT = authentification).

import {
  type ConsumeAdminInvitationDto,
  ConsumeAdminInvitationDtoSchema,
  type ValidateAdminInvitationDto,
  ValidateAdminInvitationDtoSchema,
} from '@cv/auth-domain';
import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { readActorIp } from '../../../common/actor-ip.util';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { ConsumeAdminInvitationUseCase } from '../application/use-cases/consume-admin-invitation.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { ValidateAdminInvitationUseCase } from '../application/use-cases/validate-admin-invitation.use-case';

interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

@ApiTags('auth-admin-invitation')
@Controller('api/auth')
export class AuthAdminInvitationController {
  constructor(
    private readonly validateUseCase: ValidateAdminInvitationUseCase,
    private readonly consumeUseCase: ConsumeAdminInvitationUseCase,
  ) {}

  @Post('admin-invitation/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Pré-vérifie un token d'invitation admin (US7)" })
  async validate(
    @Body(new ZodValidationPipe(ValidateAdminInvitationDtoSchema))
    body: ValidateAdminInvitationDto,
  ): Promise<
    | { readonly valid: true; readonly targetEmail: string; readonly invitationId: string }
    | { readonly valid: false; readonly code: 'INVALID_OR_EXPIRED_TOKEN' }
  > {
    const result = await this.validateUseCase.execute({ token: body.token });
    if (!result.valid) {
      return { valid: false, code: 'INVALID_OR_EXPIRED_TOKEN' };
    }
    return {
      valid: true,
      targetEmail: result.targetEmail,
      invitationId: result.invitationId,
    };
  }

  @Post('admin-invitation/consume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Consomme un token d'invitation admin (US7)" })
  @ApiResponse({ status: 200, description: 'User créé + token consumed' })
  @ApiResponse({ status: 400, description: 'INVALID_OR_EXPIRED_TOKEN / VALIDATION_FAILED' })
  @ApiResponse({ status: 409, description: 'TARGET_EMAIL_ALREADY_REGISTERED (race condition)' })
  async consume(
    @Body(new ZodValidationPipe(ConsumeAdminInvitationDtoSchema)) body: ConsumeAdminInvitationDto,
    @Req() req: AuthRequest,
  ): Promise<{ readonly status: 'ok'; readonly userId: string; readonly email: string }> {
    const actorIp = readActorIp(req);
    const result = await this.consumeUseCase.execute({
      token: body.token,
      firstName: body.firstName,
      lastName: body.lastName,
      password: body.password,
      ...(actorIp ? { actorIp } : {}),
    });
    if (result.kind === 'invalid_or_expired') {
      throw new HttpException({ code: 'INVALID_OR_EXPIRED_TOKEN' }, HttpStatus.BAD_REQUEST);
    }
    if (result.kind === 'target_email_already_registered') {
      throw new HttpException({ code: 'TARGET_EMAIL_ALREADY_REGISTERED' }, HttpStatus.CONFLICT);
    }
    return { status: 'ok', userId: result.userId, email: result.email };
  }
}
