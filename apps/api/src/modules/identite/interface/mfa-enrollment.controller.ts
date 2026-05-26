// MfaEnrollmentController — endpoints US1 (enrôlement TOTP).
//
// Routes :
//   POST /api/mfa/enroll/start    → génère secret + 10 backup codes
//   POST /api/mfa/enroll/confirm  → vérifie 1er code + active secret
//
// Sécurité :
//   - AuthGuard : session valide obligatoire.
//   - Rate limit `enroll_start` (10/h) sur /start uniquement (P1-1).
//   - Le secret en clair et les backup codes en clair sont retournés
//     UNE SEULE FOIS au caller (FR-005). Pas de log de ces valeurs.

import {
  BadRequestException,
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
import { Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../application/ports/auth-session-reader.port';
import { MFA_RATE_LIMITER, type MfaRateLimiter } from '../application/ports/mfa-rate-limiter.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { EnrollTotpUseCase } from '../application/use-cases/enroll-totp.use-case';
import { AuthGuard } from './auth.guard';
import {
  type ConfirmEnrollmentRequestDto,
  ConfirmEnrollmentRequestSchema,
  type ConfirmEnrollmentResponseDto,
  type StartEnrollmentRequestDto,
  StartEnrollmentRequestSchema,
  type StartEnrollmentResponseDto,
} from './dto/enrollment.dto';

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

// Cookie de session Auth.js — repris du AuthGuard pour récupérer le
// sessionToken courant à transmettre au use case (besoin de poser
// mfaVerifiedAt sur la bonne session).
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

// Abrégement basique IPv4 /24, IPv6 /48. Cohérent ADR-0008 (réutilisera
// le helper `maskIpAddress` de @cv/legal quand 004 sera merged sur main).
function abridgeIp(ip: string): string {
  if (ip.includes(':')) {
    // IPv6 — garde les 3 premiers groupes.
    const parts = ip.split(':');
    return `${parts.slice(0, 3).join(':')}::`;
  }
  // IPv4 — garde les 3 premiers octets.
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts.slice(0, 3).join('.')}.0`;
  return ip;
}

@ApiTags('mfa-enrollment')
@Controller('api/mfa/enroll')
@UseGuards(AuthGuard)
export class MfaEnrollmentController {
  constructor(
    private readonly enrollUseCase: EnrollTotpUseCase,
    @Inject(MFA_RATE_LIMITER) private readonly rateLimiter: MfaRateLimiter,
  ) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Démarre un flow d'enrôlement TOTP (US1)" })
  @ApiResponse({ status: 200, description: 'Secret + QR URL + backup codes (one-shot)' })
  @ApiResponse({ status: 409, description: 'MFA déjà actif (MFA_ALREADY_ENROLLED)' })
  @ApiResponse({ status: 429, description: 'Rate limit dépassé (10/h)' })
  async start(
    @Body(new ZodValidationPipe(StartEnrollmentRequestSchema))
    body: StartEnrollmentRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<StartEnrollmentResponseDto> {
    const user = req.user;
    if (!user) throw new UnauthorizedException();

    // Rate limit : 10 starts max par heure (P1-1).
    const locked = await this.rateLimiter.isLocked(user.id, 'enroll_start', null);
    if (locked.locked) {
      throw new HttpException(
        { code: 'RATE_LIMITED', unlockAt: locked.unlockAt?.toISOString() },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const recorded = await this.rateLimiter.recordAttempt(user.id, 'enroll_start', null);
    if (recorded.lockedUntil) {
      throw new HttpException(
        { code: 'RATE_LIMITED', unlockAt: recorded.lockedUntil.toISOString() },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const actorIp = readActorIp(req);
    const result = await this.enrollUseCase.start({
      userId: user.id,
      userEmail: user.email ?? `user-${user.id}`,
      enrollmentRequestId: body.enrollmentRequestId,
      ...(actorIp ? { actorIp } : {}),
    });

    return {
      secretBase32: result.secretBase32,
      keyUri: result.keyUri,
      backupCodes: [...result.backupCodes],
      enrollmentRequestId: result.enrollmentRequestId,
    };
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Confirme l'enrôlement TOTP avec le 1er code (US1)" })
  @ApiResponse({ status: 200, description: 'Secret activé, mfaVerifiedAt posé' })
  @ApiResponse({ status: 400, description: 'Code TOTP invalide ou checkbox manquante' })
  @ApiResponse({ status: 404, description: 'enrollmentRequestId inconnu' })
  async confirm(
    @Body(new ZodValidationPipe(ConfirmEnrollmentRequestSchema))
    body: ConfirmEnrollmentRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ConfirmEnrollmentResponseDto> {
    const user = req.user;
    if (!user) throw new UnauthorizedException();

    const sessionToken = readSessionToken(req);
    if (!sessionToken) {
      throw new BadRequestException({ code: 'SESSION_TOKEN_MISSING' });
    }

    const actorIp = readActorIp(req);
    const result = await this.enrollUseCase.confirm({
      userId: user.id,
      sessionToken,
      enrollmentRequestId: body.enrollmentRequestId,
      totpCode: body.totpCode,
      backupCodesAcknowledged: body.backupCodesAcknowledged,
      ...(actorIp ? { actorIp } : {}),
    });

    return { enabled: true, enabledAt: result.enabledAt.toISOString() };
  }
}
