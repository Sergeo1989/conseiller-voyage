// T060 — ProfilConseillerController (feature 007 US1).
//
// Endpoints conseiller authentifié pour la gestion de son profil :
//   - GET  /api/profil/me       → lire profil privé
//   - POST /api/profil           → éditer (champs textes / multi-select)
//   - POST /api/profil/photo     → upload photo (multipart)
//
// Guards : AuthGuard + RoleGuard('conseiller') + CguGuard (déjà en place
// via middleware Next.js, pas redondé ici).
//
// Mapping Result<T,E> → HTTP : 200 / 400 / 403 / 409 / 503 / 429.

import type { Buffer } from 'node:buffer';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  PayloadTooLargeException,
  Post,
  Req,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { readActorIp } from '../../../common/actor-ip.util';
import {
  AUTH_SESSION_READER,
  type AuthenticatedUser,
} from '../application/ports/auth-session-reader.port';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { EditerProfilUseCase } from '../application/use-cases/editer-profil.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { LireProfilPriveUseCase } from '../application/use-cases/lire-profil-prive.use-case';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { UploaderPhotoUseCase } from '../application/use-cases/uploader-photo.use-case';
import { AuthGuard } from './auth.guard';
import { RequireRole, RoleGuard } from './role.guard';

// Type Fastify minimal pour le multipart (sans dépendance forte).
interface MultipartFile {
  filename: string;
  mimetype: string;
  toBuffer(): Promise<Buffer>;
}

interface ProfilRequest {
  user: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  isMultipart?: () => boolean;
  file?: () => Promise<MultipartFile | undefined>;
}

interface EditerProfilBody {
  titre?: string | null;
  biographie?: string | null;
  specialitesCodes?: string[];
  languesCodes?: string[];
  zonesGeographiquesCodes?: string[];
  anneesExperience?: number | null;
  afficherNomComplet?: boolean;
}

@ApiTags('profil-conseiller')
@Controller('api/profil')
@UseGuards(AuthGuard, RoleGuard)
@RequireRole('conseiller')
export class ProfilConseillerController {
  constructor(
    private readonly lireProfilPrive: LireProfilPriveUseCase,
    private readonly editerProfil: EditerProfilUseCase,
    private readonly uploaderPhoto: UploaderPhotoUseCase,
  ) {
    // Le AUTH_SESSION_READER token est injecté implicitement via AuthGuard,
    // pas besoin de l'importer ici — l'import du symbole est seulement pour
    // documentation.
    void AUTH_SESSION_READER;
  }

  @Get('me')
  @ApiOperation({ summary: 'Lit le profil privé du conseiller authentifié' })
  @ApiResponse({ status: 200, description: 'Profil retourné' })
  @ApiResponse({ status: 404, description: 'PROFIL_NOT_FOUND ou PROFIL_ANONYMISE' })
  async getMe(@Req() req: ProfilRequest) {
    return this.lireProfilPrive.execute({ authUserId: req.user.id });
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Édite le profil conseiller (édition partielle)' })
  @ApiResponse({ status: 200, description: 'Profil mis à jour' })
  @ApiResponse({ status: 400, description: 'VALIDATION_FAILED' })
  @ApiResponse({ status: 409, description: 'PROFIL_ANONYMISE' })
  @ApiResponse({ status: 503, description: 'CONFORMITE_INDISPONIBLE' })
  async editer(@Body() body: EditerProfilBody, @Req() req: ProfilRequest) {
    const result = await this.editerProfil.execute({
      authUserId: req.user.id,
      ...(body.titre !== undefined && { titre: body.titre }),
      ...(body.biographie !== undefined && { biographie: body.biographie }),
      ...(body.specialitesCodes !== undefined && { specialitesCodes: body.specialitesCodes }),
      ...(body.languesCodes !== undefined && { languesCodes: body.languesCodes }),
      ...(body.zonesGeographiquesCodes !== undefined && {
        zonesGeographiquesCodes: body.zonesGeographiquesCodes,
      }),
      ...(body.anneesExperience !== undefined && { anneesExperience: body.anneesExperience }),
      ...(body.afficherNomComplet !== undefined && {
        afficherNomComplet: body.afficherNomComplet,
      }),
      actorIp: readActorIp(req as Parameters<typeof readActorIp>[0]) ?? null,
    });

    if (result.ok) return result.value;

    switch (result.error.kind) {
      case 'VALIDATION_FAILED':
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          champ: result.error.champ,
          messageFr: result.error.messageFr,
        });
      case 'OWNERSHIP_MISMATCH':
        throw new ForbiddenException({ code: 'OWNERSHIP_MISMATCH' });
      case 'PROFIL_ANONYMISE':
        throw new ConflictException({ code: 'PROFIL_ANONYMISE' });
      case 'PROFIL_NOT_FOUND':
        throw new ConflictException({ code: 'PROFIL_NOT_FOUND' });
      case 'CONFORMITE_INDISPONIBLE':
        throw new ServiceUnavailableException({ code: 'CONFORMITE_INDISPONIBLE' });
      case 'SLUG_GENERATION_FAILED':
        throw new InternalServerErrorException({ code: 'SLUG_GENERATION_FAILED' });
    }
  }

  @Post('photo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload de la photo de profil (multipart/form-data)' })
  @ApiResponse({ status: 200, description: 'Photo uploadée + dimensions' })
  @ApiResponse({ status: 413, description: 'TAILLE_DEPASSE' })
  @ApiResponse({ status: 415, description: 'FORMAT_NON_SUPPORTE' })
  @ApiResponse({ status: 422, description: 'CONTENU_NON_IMAGE / DIMENSIONS_DEPASSE' })
  @ApiResponse({ status: 503, description: 'STORAGE_HS' })
  async uploadPhoto(@Req() req: ProfilRequest) {
    if (!req.isMultipart || !req.isMultipart() || !req.file) {
      throw new BadRequestException({ code: 'MULTIPART_REQUIRED' });
    }
    const file = await req.file();
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED' });
    }
    const buffer = await file.toBuffer();

    const result = await this.uploaderPhoto.execute({
      authUserId: req.user.id,
      fileBuffer: buffer,
      declaredContentType: file.mimetype,
      actorIp: readActorIp(req as Parameters<typeof readActorIp>[0]) ?? null,
    });

    if (result.ok) return result.value;

    switch (result.error.kind) {
      case 'TAILLE_DEPASSE':
        throw new PayloadTooLargeException({
          code: 'TAILLE_DEPASSE',
          tailleOctets: result.error.tailleOctets,
          limiteOctets: result.error.limiteOctets,
        });
      case 'FORMAT_NON_SUPPORTE':
        throw new UnsupportedMediaTypeException({ code: 'FORMAT_NON_SUPPORTE' });
      case 'CONTENU_NON_IMAGE':
        throw new BadRequestException({ code: 'CONTENU_NON_IMAGE' });
      case 'DIMENSIONS_DEPASSE':
        throw new BadRequestException({
          code: 'DIMENSIONS_DEPASSE',
          width: result.error.width,
          height: result.error.height,
        });
      case 'PROFIL_ANONYMISE':
        throw new ConflictException({ code: 'PROFIL_ANONYMISE' });
      case 'PROFIL_NOT_FOUND':
        throw new ConflictException({ code: 'PROFIL_NOT_FOUND' });
      case 'STORAGE_HS':
        throw new ServiceUnavailableException({ code: 'STORAGE_HS' });
    }
  }
}
