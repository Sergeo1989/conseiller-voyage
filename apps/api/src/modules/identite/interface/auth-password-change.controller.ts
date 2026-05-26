// T103 — AuthPasswordChangeController (US6 P2).
//
// POST /api/auth/password-change — authentifié + StepUp si MFA actif.

import { type ChangePasswordDto, ChangePasswordDtoSchema } from '@cv/auth-domain';
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
import { ChangePasswordUseCase } from '../application/use-cases/change-password.use-case';
import { AuthGuard } from './auth.guard';
import { StepUpGuard } from './step-up.guard';

interface AuthenticatedRequest {
  cookies?: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  ip?: string;
}

const COOKIE_NAMES =
  process.env.NODE_ENV === 'production'
    ? (['__Host-cv.session.token'] as const)
    : (['__Host-cv.session.token', 'authjs.session-token'] as const);

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((p) => {
      const [k, ...rest] = p.trim().split('=');
      return [k ?? '', decodeURIComponent(rest.join('='))];
    }),
  );
}

function extractSessionToken(req: AuthenticatedRequest): string | null {
  const cookieHeader = req.headers.cookie;
  const headerStr = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  const headerCookies = parseCookies(headerStr);
  for (const name of COOKIE_NAMES) {
    const token = req.cookies?.[name] ?? headerCookies[name];
    if (token) return token;
  }
  return null;
}

@ApiTags('auth-password-change')
@Controller('api/auth')
@UseGuards(AuthGuard, StepUpGuard)
export class AuthPasswordChangeController {
  constructor(private readonly changeUseCase: ChangePasswordUseCase) {}

  @Post('password-change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Changement de mot de passe authentifié (US6)' })
  @ApiResponse({ status: 200, description: 'Mot de passe changé + sessions invalidées' })
  @ApiResponse({ status: 401, description: 'INVALID_CURRENT_PASSWORD ou STEP_UP_REQUIRED' })
  @ApiResponse({ status: 400, description: 'PASSWORD_REUSE / VALIDATION_FAILED' })
  async change(
    @Body(new ZodValidationPipe(ChangePasswordDtoSchema)) body: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ readonly status: 'ok'; readonly sessionsRevokedCount: number }> {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    const token = extractSessionToken(req);
    if (!token) throw new UnauthorizedException({ code: 'NO_ACTIVE_SESSION' });
    const actorIp = readActorIp(req);
    const result = await this.changeUseCase.execute({
      userId: user.id,
      currentSessionToken: token,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      ...(actorIp ? { actorIp } : {}),
    });
    return { status: 'ok', sessionsRevokedCount: result.sessionsRevokedCount };
  }
}
