// T053 — AuthSignupController (US1 P1 MVP).
//
// POST /api/auth/signup — public, rate-limit 10/h/IP via @Throttle().
// Status 202 Accepted (effet final dépend du drainage outbox 003).
// Réponse uniforme — anti-énumération (R5).

import { type SignupDto, SignupDtoSchema } from '@cv/auth-domain';
import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { readActorIp } from '../../../common/actor-ip.util';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { SignupConseillerUseCase } from '../application/use-cases/signup-conseiller.use-case';

interface AuthSignupRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

@ApiTags('auth-signup')
@Controller('api/auth')
export class AuthSignupController {
  constructor(private readonly signupUseCase: SignupConseillerUseCase) {}

  @Post('signup')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } }) // 10/h/IP (M5/M9)
  @ApiOperation({ summary: 'Inscription conseiller self-service (US1)' })
  @ApiResponse({ status: 202, description: 'Accepté (compte créé OU email déjà connu)' })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED / TERMS_NOT_ACCEPTED' })
  @ApiResponse({ status: 429, description: 'RATE_LIMIT_EXCEEDED' })
  async signup(
    @Body(new ZodValidationPipe(SignupDtoSchema)) body: SignupDto,
    @Req() req: AuthSignupRequest,
  ): Promise<{ readonly status: 'ok'; readonly message: string }> {
    const actorIp = readActorIp(req);
    await this.signupUseCase.execute({
      emailRaw: body.email,
      password: body.password,
      firstName: body.firstName,
      lastName: body.lastName,
      acceptedTerms: body.acceptedTerms,
      acceptedPrivacyPolicy: body.acceptedPrivacyPolicy,
      ...(actorIp ? { actorIp } : {}),
    });

    return {
      status: 'ok',
      message:
        "Si ce courriel n'est pas déjà utilisé, vous recevrez un courriel de vérification dans les prochaines minutes.",
    };
  }
}
