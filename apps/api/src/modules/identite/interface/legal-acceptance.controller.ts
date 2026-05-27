// T070 + T071 — LegalAcceptanceController (US3 P2).
//
//   POST /api/me/legal/accept           : enregistre l'acceptation explicite
//   GET  /api/me/legal/version-status   : statut CGU B2B pour le middleware
//
// Sécurité : AuthGuard (sessions Auth.js partagées). Le RBAC voyageur est
// délégué à AcceptCguB2bUseCase qui throw ForbiddenException si role==='voyageur'.
//
// Le Set-Cookie HMAC `__Host-cv.legal-version` (ADR-0009) est ajouté par les
// deux endpoints — il signale au middleware Next.js que la version courante a
// été vérifiée récemment (TTL 5 min, évite un round-trip par requête).

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { readActorIp } from '../../../common/actor-ip.util';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../application/ports/auth-session-reader.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { AcceptCguB2bUseCase } from '../application/use-cases/accept-cgu-b2b.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { CheckCguUpToDateUseCase } from '../application/use-cases/check-cgu-up-to-date.use-case';
import { AuthGuard } from './auth.guard';
import {
  type AcceptCguB2bBody,
  AcceptCguB2bBodySchema,
  type AcceptCguB2bResponse,
  type LegalVersionStatusResponse,
} from './dto/legal-acceptance.dto';

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

@ApiTags('legal')
@Controller('api/me/legal')
@UseGuards(AuthGuard)
export class LegalAcceptanceController {
  constructor(
    private readonly acceptUseCase: AcceptCguB2bUseCase,
    private readonly checkUseCase: CheckCguUpToDateUseCase,
  ) {}

  @Post('accept')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Accepter une version CGU B2B (conseiller / admin)' })
  @ApiResponse({ status: 201, description: 'Acceptance enregistrée (ou rejeu idempotent).' })
  @ApiResponse({ status: 400, description: 'Validation Zod du body en erreur.' })
  @ApiResponse({ status: 403, description: 'CGU_B2B_NOT_APPLICABLE_TO_VOYAGEUR' })
  @ApiResponse({ status: 404, description: 'UNKNOWN_LEGAL_DOCUMENT_VERSION ou pas effective.' })
  @ApiResponse({ status: 409, description: 'LEGAL_DOCUMENT_VERSION_SUPERSEDED' })
  async accept(
    @Body(new ZodValidationPipe(AcceptCguB2bBodySchema)) body: AcceptCguB2bBody,
    @Req() req: AuthenticatedRequest,
  ): Promise<AcceptCguB2bResponse> {
    // AuthGuard a déjà rejeté les anonymes. user ne peut pas être undefined ici.
    // biome-ignore lint/style/noNonNullAssertion: AuthGuard guarantees user is set
    const user = req.user!;
    const result = await this.acceptUseCase.execute({
      userId: user.id,
      actorRole: user.role,
      documentVersion: body.documentVersion,
      ipAddress: readActorIp(req) ?? '0.0.0.0',
      userAgent: extractUserAgent(req),
    });
    return {
      status: 'ok',
      acceptanceId: result.acceptance.id,
      documentVersion: result.acceptance.documentVersion,
      alreadyAccepted: result.alreadyAccepted,
    };
  }

  @Get('version-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statut CGU B2B pour le middleware Next.js' })
  @ApiResponse({ status: 200, description: 'Renvoie status + currentVersion + acceptedVersion.' })
  @ApiResponse({ status: 404, description: 'NO_EFFECTIVE_CGU_B2B_VERSION (anomalie déploiement).' })
  async versionStatus(@Req() req: AuthenticatedRequest): Promise<LegalVersionStatusResponse> {
    // biome-ignore lint/style/noNonNullAssertion: AuthGuard guarantees user is set
    const user = req.user!;
    const result = await this.checkUseCase.execute({ userId: user.id });
    return {
      status: result.status,
      currentVersion: result.currentVersion,
      acceptedVersion: result.acceptedVersion,
    };
  }
}

function extractUserAgent(req: AuthenticatedRequest): string {
  const ua = req.headers['user-agent'];
  if (typeof ua === 'string') return ua;
  if (Array.isArray(ua) && ua[0]) return ua[0];
  return 'unknown';
}
