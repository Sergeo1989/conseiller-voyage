// MfaVerificationController — endpoints US3 (login TOTP + backup code).
//
// Routes :
//   POST /api/mfa/verify              → vérifie code TOTP au login
//   POST /api/mfa/verify-backup-code  → vérifie code de récupération
//
// Sécurité :
//   - AuthGuard : session déjà créée par Auth.js (post-mot-de-passe),
//     mais mfaVerifiedAt = null tant que le 2e facteur n'est pas validé.
//   - Lockout 15 min après 5 échecs en 5 min (bucket login_totp).

import {
  Body,
  Controller,
  HttpCode,
  HttpException,
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
import { VerifyBackupCodeUseCase } from '../application/use-cases/verify-backup-code.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { VerifyTotpUseCase } from '../application/use-cases/verify-totp.use-case';
import { AuthGuard } from './auth.guard';
import {
  type VerifyBackupCodeRequestDto,
  VerifyBackupCodeRequestSchema,
  type VerifyBackupCodeResponseDto,
  type VerifyTotpRequestDto,
  VerifyTotpRequestSchema,
  type VerifyTotpResponseDto,
} from './dto/verify.dto';

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

@ApiTags('mfa-verification')
@Controller('api/mfa')
@UseGuards(AuthGuard)
export class MfaVerificationController {
  constructor(
    private readonly verifyTotp: VerifyTotpUseCase,
    private readonly verifyBackup: VerifyBackupCodeUseCase,
  ) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifie un code TOTP au login (US3)' })
  @ApiResponse({ status: 200, description: 'kind: ok | invalid' })
  @ApiResponse({ status: 429, description: 'Verrouillage temporaire 15 min après 5 échecs' })
  async verifyTotpCode(
    @Body(new ZodValidationPipe(VerifyTotpRequestSchema)) body: VerifyTotpRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<VerifyTotpResponseDto> {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    const sessionToken = readSessionToken(req);
    if (!sessionToken) throw new UnauthorizedException({ code: 'SESSION_TOKEN_MISSING' });

    const actorIp = readActorIp(req);
    const result = await this.verifyTotp.execute({
      userId: user.id,
      userEmail: user.email ?? `user-${user.id}`,
      sessionToken,
      totpCode: body.totpCode,
      ...(actorIp ? { actorIp } : {}),
    });

    if (result.kind === 'locked') {
      throw new HttpException(
        { code: 'LOCKED', unlockAt: result.unlockAt.toISOString() },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (result.kind === 'ok') {
      return { kind: 'ok', verifiedAt: result.verifiedAt.toISOString() };
    }
    return { kind: 'invalid', attemptsRemaining: result.attemptsRemaining };
  }

  @Post('verify-backup-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifie un code de récupération au login (US3)' })
  @ApiResponse({ status: 200, description: 'kind: ok (avec remaining + warnLow) | invalid' })
  @ApiResponse({ status: 429, description: 'Verrouillage temporaire 15 min après 5 échecs' })
  async verifyBackupCode(
    @Body(new ZodValidationPipe(VerifyBackupCodeRequestSchema))
    body: VerifyBackupCodeRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<VerifyBackupCodeResponseDto> {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    const sessionToken = readSessionToken(req);
    if (!sessionToken) throw new UnauthorizedException({ code: 'SESSION_TOKEN_MISSING' });

    const actorIp = readActorIp(req);
    const result = await this.verifyBackup.execute({
      userId: user.id,
      userEmail: user.email ?? `user-${user.id}`,
      sessionToken,
      backupCode: body.backupCode,
      ...(actorIp ? { actorIp } : {}),
    });

    if (result.kind === 'locked') {
      throw new HttpException(
        { code: 'LOCKED', unlockAt: result.unlockAt.toISOString() },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (result.kind === 'ok') {
      return {
        kind: 'ok',
        verifiedAt: result.verifiedAt.toISOString(),
        remainingCount: result.remainingCount,
        warnLowCodes: result.warnLowCodes,
      };
    }
    return { kind: 'invalid', attemptsRemaining: result.attemptsRemaining };
  }
}
