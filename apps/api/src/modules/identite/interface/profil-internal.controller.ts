// T131 — Controller interne pour l'anonymisation Loi 25 (feature 007 US5).
//
// Consommé exclusivement par l'orchestrateur Loi 25 (feature 023 future).
// Auth via header X-Internal-Service-Token (vérifié contre AWS Secrets
// Manager runtime).

import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { env } from '../../../env';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { AnonymiserProfilLoi25UseCase } from '../application/use-cases/anonymiser-profil-loi25.use-case';

interface InternalRequest {
  headers: Record<string, string | string[] | undefined>;
}

interface AnonymiserBody {
  readonly orchestrateurReference: string;
}

const INTERNAL_HEADER = 'x-internal-service-token';

@Controller('api/internal/profil')
export class ProfilInternalController {
  constructor(private readonly anonymiser: AnonymiserProfilLoi25UseCase) {}

  @Post(':id/anonymiser-loi25')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Anonymisation Loi 25 (interne — orchestré par 023)' })
  async anonymiserEndpoint(
    @Param('id') id: string,
    @Body() body: AnonymiserBody,
    @Req() req: InternalRequest,
  ) {
    const tokenHeader = req.headers[INTERNAL_HEADER];
    const expected = env.CV_REVALIDATE_SECRET; // réutilise le secret interne au MVP
    if (typeof tokenHeader !== 'string' || tokenHeader !== expected) {
      throw new ForbiddenException({ code: 'UNAUTHORIZED' });
    }
    await this.anonymiser.execute({
      conseillerProfileId: id,
      orchestrateurReference: body.orchestrateurReference,
    });
    return { status: 'ok' };
  }
}
