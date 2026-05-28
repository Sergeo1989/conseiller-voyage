// Controller public profil — endpoints consommés par Next.js apps/web
// (Server Components côté SSG/ISR). PAS d'AuthGuard, route publique.
//
// Anti-énumération SC-003 : 404 unifié, body constant, status identique
// pour tous les cas non-visibles.

import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { LirePageProfilPubliqueUseCase } from '../application/use-cases/lire-page-profil-publique.use-case';

@ApiTags('profil-public')
@Controller('api/public/profil')
export class ProfilPublicController {
  constructor(private readonly useCase: LirePageProfilPubliqueUseCase) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Lecture page publique conseiller par slug' })
  @ApiResponse({ status: 200, description: 'Profil retourné (verifié + statut prêt)' })
  @ApiResponse({ status: 404, description: 'Anti-énumération (slug inexistant/masqué/incomplet)' })
  async lireParSlug(@Param('slug') slug: string) {
    const payload = await this.useCase.execute({ slug });
    if (!payload) {
      // Anti-énumération SC-003 : message constant, pas de raison fuitée.
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }
    return payload;
  }

  @Get()
  @ApiOperation({ summary: 'Liste des slugs publiables — pour sitemap.xml' })
  async lireSlugsPubliables() {
    const slugs = await this.useCase.lireSlugsPubliables();
    return { slugs };
  }
}
