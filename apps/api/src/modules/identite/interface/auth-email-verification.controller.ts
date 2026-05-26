// T080 — AuthEmailVerificationController (US3 P1 MVP).
//
// Routes :
//   GET  /api/auth/verify-email?token=...        → consomme + redirect 302
//   POST /api/auth/verify-email/resend           → renvoie un courriel
//
// Anti-énumération sur le resend : retour 202 uniforme.

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { readActorIp } from '../../../common/actor-ip.util';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { ResendEmailVerificationUseCase } from '../application/use-cases/resend-email-verification.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { VerifyEmailUseCase } from '../application/use-cases/verify-email.use-case';

interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

interface FastifyReplyLike {
  redirect(url: string, statusCode?: number): unknown;
  header(name: string, value: string): unknown;
}

const ResendDtoSchema = z.object({
  email: z.string().email({ message: 'EMAIL_INVALID' }).max(254),
});

@ApiTags('auth-email-verification')
@Controller('api/auth')
export class AuthEmailVerificationController {
  constructor(
    private readonly verifyUseCase: VerifyEmailUseCase,
    private readonly resendUseCase: ResendEmailVerificationUseCase,
  ) {}

  @Get('verify-email')
  @ApiOperation({ summary: 'Vérifie un courriel via un lien à usage unique (US3)' })
  @ApiResponse({
    status: 302,
    description: 'Redirect /connexion?verified=1 OU /verifier-email/erreur',
  })
  async verify(
    @Query('token') token: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: FastifyReplyLike,
  ): Promise<void> {
    const actorIp = readActorIp(req);
    const result = await this.verifyUseCase.execute({
      token: token ?? '',
      ...(actorIp ? { actorIp } : {}),
    });
    const webBase = process.env.WEB_BASE_URL ?? 'http://localhost:3000';
    const target =
      result.kind === 'ok'
        ? `${webBase}/fr-ca/connexion?verified=1`
        : `${webBase}/fr-ca/verifier-email/erreur`;
    res.redirect(target, 302);
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Renvoie un courriel de vérification (US3)' })
  @ApiResponse({ status: 202, description: 'Accepté (rate-limit silencieux)' })
  async resend(
    @Body(new ZodValidationPipe(ResendDtoSchema)) body: { email: string },
    @Req() req: AuthRequest,
  ): Promise<{ readonly status: 'ok' }> {
    const actorIp = readActorIp(req);
    await this.resendUseCase.execute({
      emailRaw: body.email,
      ...(actorIp ? { actorIp } : {}),
    });
    return { status: 'ok' };
  }
}
