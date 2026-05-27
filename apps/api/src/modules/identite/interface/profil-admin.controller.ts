// T119 — Controller admin modération profil (feature 007 US6).
//
// Guards : AuthGuard + RoleGuard('admin') + StepUpGuard (M2 — actions
// destructrices nécessitent re-vérification MFA fraîche).

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../application/ports/auth-session-reader.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { MasquerProfilAdminUseCase } from '../application/use-cases/masquer-profil-admin.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { RetablirProfilAdminUseCase } from '../application/use-cases/retablir-profil-admin.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { RetirerPhotoAdminUseCase } from '../application/use-cases/retirer-photo-admin.use-case';
import { AuthGuard } from './auth.guard';
import { RequireRole, RoleGuard } from './role.guard';
import { StepUpGuard } from './step-up.guard';

interface AdminProfilRequest {
  user: AuthenticatedUser;
}

interface RaisonBody {
  readonly raison?: string;
}

@ApiTags('profil-admin')
@Controller('api/admin/profils')
@UseGuards(AuthGuard, RoleGuard)
@RequireRole('admin')
export class ProfilAdminController {
  constructor(
    private readonly retirerPhoto: RetirerPhotoAdminUseCase,
    private readonly masquerProfil: MasquerProfilAdminUseCase,
    private readonly retablirProfil: RetablirProfilAdminUseCase,
  ) {}

  @Post(':id/retirer-photo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StepUpGuard)
  @ApiOperation({ summary: 'Retire la photo (action destructive — StepUpGuard)' })
  @ApiResponse({ status: 200 })
  async retirerPhotoEndpoint(
    @Param('id') id: string,
    @Body() body: RaisonBody,
    @Req() req: AdminProfilRequest,
  ) {
    const raison = body.raison?.trim() ?? '';
    if (raison.length < 10) {
      throw new BadRequestException({ code: 'RAISON_TROP_COURTE' });
    }
    const result = await this.retirerPhoto.execute({
      adminAuthUserId: req.user.id,
      adminEmail: req.user.email ?? 'unknown',
      conseillerProfileId: id,
      raison,
    });
    if (!result.ok) {
      throw mapErrorToHttp(result.error.kind);
    }
    return result.value;
  }

  @Post(':id/masquer')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StepUpGuard)
  @ApiOperation({ summary: 'Masque temporairement le profil (StepUpGuard)' })
  async masquerEndpoint(
    @Param('id') id: string,
    @Body() body: RaisonBody,
    @Req() req: AdminProfilRequest,
  ) {
    const raison = body.raison?.trim() ?? '';
    if (raison.length < 10) {
      throw new BadRequestException({ code: 'RAISON_TROP_COURTE' });
    }
    const result = await this.masquerProfil.execute({
      adminAuthUserId: req.user.id,
      adminEmail: req.user.email ?? 'unknown',
      conseillerProfileId: id,
      raison,
    });
    if (!result.ok) {
      throw mapErrorToHttp(result.error.kind);
    }
    return result.value;
  }

  @Post(':id/retablir')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rétablit un profil masqué (constructif, pas de StepUp)' })
  async retablirEndpoint(
    @Param('id') id: string,
    @Body() body: RaisonBody,
    @Req() req: AdminProfilRequest,
  ) {
    const result = await this.retablirProfil.execute({
      adminAuthUserId: req.user.id,
      adminEmail: req.user.email ?? 'unknown',
      conseillerProfileId: id,
      ...(body.raison && { raison: body.raison }),
    });
    if (!result.ok) {
      throw mapErrorToHttp(result.error.kind);
    }
    return result.value;
  }
}

function mapErrorToHttp(kind: string) {
  if (kind === 'PROFIL_NOT_FOUND') return new NotFoundException({ code: kind });
  if (
    kind === 'PROFIL_ANONYMISE' ||
    kind === 'DEJA_MASQUE' ||
    kind === 'PAS_MASQUE' ||
    kind === 'AUCUNE_PHOTO'
  ) {
    return new ConflictException({ code: kind });
  }
  return new BadRequestException({ code: kind });
}
