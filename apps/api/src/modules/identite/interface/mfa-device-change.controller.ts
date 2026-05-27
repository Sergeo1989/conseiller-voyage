// MfaDeviceChangeController — US6 P2 (auto-service device change +
// régénération de codes).
//
// Routes :
//   POST /api/mfa/change-device/start       → US6 (mdp + 2e facteur)
//   POST /api/mfa/regenerate-backup-codes   → FR-014 (step-up requis)

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
import { ChangeDeviceUseCase } from '../application/use-cases/change-device.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { RegenerateBackupCodesUseCase } from '../application/use-cases/regenerate-backup-codes.use-case';
import { AuthGuard } from './auth.guard';
import {
  type ChangeDeviceRequestDto,
  ChangeDeviceRequestSchema,
  type ChangeDeviceResponseDto,
  type RegenerateBackupCodesResponseDto,
} from './dto/device-change.dto';
import { StepUpGuard } from './step-up.guard';

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

@ApiTags('mfa-device-change')
@Controller('api/mfa')
@UseGuards(AuthGuard)
export class MfaDeviceChangeController {
  constructor(
    private readonly changeDevice: ChangeDeviceUseCase,
    private readonly regenerateCodes: RegenerateBackupCodesUseCase,
  ) {}

  @Post('change-device/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Démarre un changement de device TOTP (US6)' })
  @ApiResponse({ status: 200, description: 'Secret + QR + backup codes (one-shot)' })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS' })
  @ApiResponse({ status: 400, description: 'INVALID_SECOND_FACTOR ou MFA_NOT_ENROLLED' })
  async startChangeDevice(
    @Body(new ZodValidationPipe(ChangeDeviceRequestSchema)) body: ChangeDeviceRequestDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ChangeDeviceResponseDto> {
    const user = req.user;
    if (!user) throw new UnauthorizedException();
    const sessionToken = readSessionToken(req);
    if (!sessionToken) throw new UnauthorizedException({ code: 'SESSION_TOKEN_MISSING' });

    const actorIp = readActorIp(req);
    const result = await this.changeDevice.execute({
      userId: user.id,
      userEmail: user.email ?? `user-${user.id}`,
      sessionToken,
      password: body.password,
      secondFactor: body.secondFactor,
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

  @Post('regenerate-backup-codes')
  @UseGuards(StepUpGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Régénère le lot de 10 backup codes (FR-014, step-up requis)' })
  async regenerateBackupCodes(
    @Req() req: AuthenticatedRequest,
  ): Promise<RegenerateBackupCodesResponseDto> {
    const user = req.user;
    if (!user) throw new UnauthorizedException();

    const actorIp = readActorIp(req);
    const result = await this.regenerateCodes.execute({
      userId: user.id,
      ...(actorIp ? { actorIp } : {}),
    });

    return { backupCodes: [...result.backupCodes] };
  }
}
