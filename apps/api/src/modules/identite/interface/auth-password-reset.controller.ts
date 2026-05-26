// T094 — AuthPasswordResetController (US5 P2).
//
// 2 endpoints :
//   POST /api/auth/password-reset-request — public, anti-énum uniforme
//   POST /api/auth/password-reset           — public, token-auth

import {
  type CompletePasswordResetDto,
  CompletePasswordResetDtoSchema,
  type RequestPasswordResetDto,
  RequestPasswordResetDtoSchema,
} from '@cv/auth-domain';
import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { readActorIp } from '../../../common/actor-ip.util';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { CompletePasswordResetUseCase } from '../application/use-cases/complete-password-reset.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { RequestPasswordResetUseCase } from '../application/use-cases/request-password-reset.use-case';

interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

@ApiTags('auth-password-reset')
@Controller('api/auth')
export class AuthPasswordResetController {
  constructor(
    private readonly requestUseCase: RequestPasswordResetUseCase,
    private readonly completeUseCase: CompletePasswordResetUseCase,
  ) {}

  @Post('password-reset-request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Demande un lien de reset de mot de passe (US5)' })
  @ApiResponse({ status: 202, description: 'Accepté (uniform anti-enum)' })
  async request(
    @Body(new ZodValidationPipe(RequestPasswordResetDtoSchema)) body: RequestPasswordResetDto,
    @Req() req: AuthRequest,
  ): Promise<{ readonly status: 'ok' }> {
    const actorIp = readActorIp(req);
    await this.requestUseCase.execute({
      emailRaw: body.email,
      ...(actorIp ? { actorIp } : {}),
    });
    return { status: 'ok' };
  }

  @Post('password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consomme un lien de reset + UPDATE password (US5)' })
  @ApiResponse({ status: 200, description: 'Mot de passe mis à jour, sessions invalidées' })
  @ApiResponse({ status: 400, description: 'INVALID_OR_EXPIRED_TOKEN / VALIDATION_FAILED' })
  async complete(
    @Body(new ZodValidationPipe(CompletePasswordResetDtoSchema)) body: CompletePasswordResetDto,
    @Req() req: AuthRequest,
  ): Promise<{ readonly status: 'ok'; readonly sessionsRevokedCount: number }> {
    const actorIp = readActorIp(req);
    const result = await this.completeUseCase.execute({
      token: body.token,
      newPassword: body.newPassword,
      ...(actorIp ? { actorIp } : {}),
    });
    if (result.kind === 'invalid_or_expired') {
      throw new HttpException({ code: 'INVALID_OR_EXPIRED_TOKEN' }, HttpStatus.BAD_REQUEST);
    }
    if (result.kind === 'validation_error') {
      throw new HttpException(
        { code: 'VALIDATION_FAILED', errors: result.errors },
        HttpStatus.BAD_REQUEST,
      );
    }
    return { status: 'ok', sessionsRevokedCount: result.sessionsRevokedCount };
  }
}
