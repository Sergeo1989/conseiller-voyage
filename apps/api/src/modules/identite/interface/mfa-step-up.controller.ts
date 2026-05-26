// MfaStepUpController — endpoints US2 (élévation de session).
//
// Routes :
//   POST /api/mfa/step-up                → vérifie un code TOTP intra-session
//   GET  /api/mfa/session-freshness      → check freshness sans step-up
//                                          (utilisé par le frontend pour
//                                          décider d'ouvrir le modal,
//                                          aligné P1-4)
//
// Sécurité :
//   - AuthGuard : session valide obligatoire.
//   - StepUpUseCase gère la révocation de session sur 3 échecs.

import { isFresh } from '@cv/mfa';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
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
import { StepUpUseCase } from '../application/use-cases/step-up.use-case';
import { AuthGuard } from './auth.guard';
import {
  type SessionFreshnessResponseDto,
  type StepUpRequestDto,
  StepUpRequestSchema,
  type StepUpResponseDto,
} from './dto/step-up.dto';

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

const SESSION_COOKIE_NAMES =
  process.env.NODE_ENV === 'production'
    ? (['__Host-cv.session.token'] as const)
    : (['__Host-cv.session.token', 'authjs.session-token'] as const);

function readSessionToken(req: AuthenticatedRequest): string | null {
  const cookieHeader = typeof req.headers.cookie === 'string' ? req.headers.cookie : null;
  if (!cookieHeader) return null;
  for (const name of SESSION_COOKIE_NAMES) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match) return decodeURIComponent(match[1] ?? '');
  }
  return null;
}

@ApiTags('mfa-step-up')
@Controller('api/mfa')
@UseGuards(AuthGuard)
export class MfaStepUpController {
  constructor(private readonly stepUpUseCase: StepUpUseCase) {}

  @Post('step-up')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Step-up TOTP pour action sensible (US2)' })
  @ApiResponse({ status: 200, description: 'Step-up OK ou code invalide (kind: ok | invalid)' })
  @ApiResponse({ status: 401, description: 'Session invalidée après 3 échecs (SESSION_KILLED)' })
  async stepUp(
    @Body(new ZodValidationPipe(StepUpRequestSchema)) body: StepUpRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<StepUpResponseDto> {
    const user = req.user;
    if (!user) throw new UnauthorizedException();

    const sessionToken = readSessionToken(req);
    if (!sessionToken) throw new UnauthorizedException({ code: 'SESSION_TOKEN_MISSING' });

    // Le sessionId est nécessaire pour scoper le bucket de rate limit
    // par session (P0-3). On le lit depuis la BD via le sessionToken.
    const sessionId = await this.lookupSessionId(sessionToken);

    const actorIp = readActorIp(req);
    const result = await this.stepUpUseCase.execute({
      userId: user.id,
      userEmail: user.email ?? `user-${user.id}`,
      sessionId,
      sessionToken,
      totpCode: body.totpCode,
      intendedAction: body.intendedAction,
      ...(actorIp ? { actorIp } : {}),
    });

    if (result.kind === 'session_killed') {
      throw new HttpException(
        { code: 'SESSION_KILLED', message: 'Session invalidée après 3 échecs step-up' },
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (result.kind === 'ok') {
      return { kind: 'ok', verifiedAt: result.verifiedAt.toISOString() };
    }
    return { kind: 'invalid', attemptsRemaining: result.attemptsRemaining };
  }

  @Get('session-freshness')
  @ApiOperation({ summary: 'Vérifie si la session courante est MFA-frais (P1-4)' })
  async checkFreshness(@Req() req: AuthenticatedRequest): Promise<SessionFreshnessResponseDto> {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    return {
      fresh: isFresh(user.mfaVerifiedAt, new Date()),
      mfaVerifiedAt: user.mfaVerifiedAt?.toISOString() ?? null,
    };
  }

  private async lookupSessionId(sessionToken: string): Promise<string> {
    // Lookup léger via Prisma — la session est déjà validée par AuthGuard.
    const { prisma } = await import('@cv/db');
    const row = await prisma.authSession.findUnique({
      where: { sessionToken },
      select: { id: true },
    });
    if (!row) {
      throw new UnauthorizedException({ code: 'SESSION_NOT_FOUND' });
    }
    return row.id;
  }
}
