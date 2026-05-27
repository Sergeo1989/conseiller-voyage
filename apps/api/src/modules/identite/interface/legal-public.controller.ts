// Endpoint public auxiliaire — GET /api/legal/cgu-b2b/current-version.
//
// Consommé par le middleware Next.js (apps/web/src/middleware.ts) qui
// tourne en runtime edge et n'a pas accès direct à Prisma. Le middleware
// l'appelle avec un cache process 60 s pour éviter de marteler l'API.
//
// Pas d'AuthGuard : la version courante n'est pas une info sensible.

import { Controller, Get, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type LegalDocumentRepository,
} from '../application/ports/legal-document-repository.port';

@ApiTags('legal-public')
@Controller('api/legal')
export class LegalPublicController {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly documents: LegalDocumentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get('cgu-b2b/current-version')
  @ApiOperation({ summary: 'Version courante effective du CGU B2B' })
  @ApiResponse({ status: 200, description: '{ version: number }' })
  @ApiResponse({ status: 404, description: 'Aucune version effective seedée' })
  async currentVersion(): Promise<{ readonly version: number }> {
    const current = await this.documents.findCurrentByType('cgu_b2b', this.clock.now());
    if (!current) {
      throw new NotFoundException({ code: 'NO_EFFECTIVE_CGU_B2B_VERSION' });
    }
    return { version: current.version };
  }
}
