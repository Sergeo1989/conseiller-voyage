// T068 — AuthLoginController (US2 P1 MVP).
//
// POST /api/auth/login — consommé par le callback `authorize` du provider
// `Credentials` Auth.js v5 (server-to-server). Aussi accessible
// directement pour les tests d'intégration.
//
// Réponses :
//   200 { userId, role, redirect } — login OK
//   401 { code: 'INVALID_CREDENTIALS' } — uniforme anti-énumération
//   423 { code: 'ACCOUNT_LOCKED', reason } + header Retry-After

import { type LoginDto, LoginDtoSchema } from '@cv/auth-domain';
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { readActorIp } from '../../../common/actor-ip.util';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { LoginUseCase } from '../application/use-cases/login.use-case';

// Type Fastify minimal sans dépendance d'import (déjà transitive via @nestjs/platform-fastify).
interface FastifyReplyLike {
  header(name: string, value: string): unknown;
}

interface AuthLoginRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

interface LoginResponseBody {
  readonly userId: string;
  readonly role: 'voyageur' | 'conseiller' | 'admin';
  readonly redirect: string;
}

@ApiTags('auth-login')
@Controller('api/auth')
export class AuthLoginController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login conseiller + admin (US2)' })
  @ApiResponse({ status: 200, description: 'Session ouverte, redirect retourné' })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS (anti-énumération uniforme)' })
  @ApiResponse({ status: 423, description: 'ACCOUNT_LOCKED + Retry-After header' })
  async login(
    @Body(new ZodValidationPipe(LoginDtoSchema)) body: LoginDto,
    @Req() req: AuthLoginRequest,
    @Res({ passthrough: true }) res: FastifyReplyLike,
  ): Promise<LoginResponseBody> {
    const actorIp = readActorIp(req);
    const result = await this.loginUseCase.execute({
      emailRaw: body.email,
      password: body.password,
      ...(actorIp ? { actorIp } : {}),
    });

    if (result.kind === 'ok') {
      return { userId: result.userId, role: result.role, redirect: result.redirect };
    }

    if (result.kind === 'locked') {
      res.header('Retry-After', String(result.retryAfterSec));
      // HTTP 423 Locked (pas dans le enum NestJS HttpStatus historique).
      throw new HttpException({ code: 'ACCOUNT_LOCKED', reason: result.reason }, 423);
    }

    // invalid_credentials — note C3 : pas de `sessionTokenHash` (session pas
    // encore créée par Auth.js au moment de cet event).
    throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
  }
}
