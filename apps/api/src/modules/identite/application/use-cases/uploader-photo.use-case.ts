// T059 — UploaderPhotoUseCase (feature 007 US1, saga S3↔DB).
//
// Pipeline (cf. contracts/profil-edition.port.md C4) :
//   1. Validation taille (< 5 Mo)
//   2. Validation magic number (12 octets, sharp metadata)
//   3. INSERT row profile_photo_history statut='pending_upload'
//   4. PUT S3
//   5. Si OK : transaction Postgres :
//        - markCommit history
//        - updatePhoto profil (photoS3Key + dimensions)
//   6. Si UPDATE DB échoue après PUT S3 → compensation (delete S3 + delete row)
//   7. FIFO eviction si > 5 photos commit (markEvicted + delete S3 best-effort)
//   8. Recalcul statut + invalidations
//
// Retourne Result<T,E>.

import { randomUUID } from 'node:crypto';
import { prisma } from '@cv/db';
import {
  type Result,
  calculerStatutProfil,
  detecterFormatImage,
  err,
  ok,
  profilEstComplet,
} from '@cv/profil-domain';
import { MAX_PHOTO_SIZE_BYTES } from '@cv/profil-domain/dtos';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import { Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { env } from '../../../../env';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import {
  CLOUDFRONT_CACHE_INVALIDATOR,
  type CloudFrontCacheInvalidator,
} from '../ports/cloudfront-cache-invalidator.port';
import {
  PHOTO_HISTORIQUE_REPOSITORY,
  type PhotoHistoriqueRepository,
} from '../ports/photo-historique-repository.port';
import { PHOTO_STORAGE, type PhotoStorage } from '../ports/photo-storage.port';
import {
  PROFIL_CONSEILLER_REPOSITORY,
  type ProfilConseillerRepository,
} from '../ports/profil-conseiller-repository.port';

const FIFO_MAX_PHOTOS = 5;
const MAX_DIMENSION = 4096;

export interface UploaderPhotoInput {
  readonly authUserId: string;
  readonly fileBuffer: Buffer;
  readonly declaredContentType: string;
  readonly actorIp?: string | null;
}

export interface UploaderPhotoSuccess {
  readonly photoS3Key: string;
  readonly photoUrlPublique: string;
  readonly photoWidth: number;
  readonly photoHeight: number;
  readonly versionsHistorique: number;
}

export type UploaderPhotoError =
  | { kind: 'FORMAT_NON_SUPPORTE'; formatDetecte: string | null }
  | { kind: 'TAILLE_DEPASSE'; tailleOctets: number; limiteOctets: number }
  | { kind: 'CONTENU_NON_IMAGE' }
  | { kind: 'DIMENSIONS_DEPASSE'; width: number; height: number }
  | { kind: 'PROFIL_ANONYMISE' }
  | { kind: 'PROFIL_NOT_FOUND' }
  | { kind: 'STORAGE_HS' };

@Injectable()
export class UploaderPhotoUseCase {
  private readonly logger = new Logger('UploaderPhotoUseCase');

  constructor(
    @Inject(PROFIL_CONSEILLER_REPOSITORY)
    private readonly profilRepo: ProfilConseillerRepository,
    @Inject(PHOTO_HISTORIQUE_REPOSITORY)
    private readonly historique: PhotoHistoriqueRepository,
    @Inject(PHOTO_STORAGE)
    private readonly storage: PhotoStorage,
    @Inject(CONFORMITE_QUERY_PORT)
    private readonly conformite: ConformiteQueryPort,
    @Inject(CLOUDFRONT_CACHE_INVALIDATOR)
    private readonly cdnInvalidator: CloudFrontCacheInvalidator,
    @Inject(AUTH_AUDIT_WRITER)
    private readonly audit: AuthAuditWriter,
  ) {}

  async execute(
    input: UploaderPhotoInput,
  ): Promise<Result<UploaderPhotoSuccess, UploaderPhotoError>> {
    // 1+2+3 Validation pré-upload (taille, magic, metadata)
    const preValidation = await this.validerFichier(input.fileBuffer);
    if (!preValidation.ok) return preValidation;
    const { format, width, height } = preValidation.value;

    // 4. Lecture profil
    const profil = await this.profilRepo.findByAuthUserId(input.authUserId);
    if (!profil) return err({ kind: 'PROFIL_NOT_FOUND' as const });
    if (profil.statut === 'anonymise') return err({ kind: 'PROFIL_ANONYMISE' as const });

    // 5. Saga upload (insertPending → PUT S3 → COMMIT DB tx) avec compensation
    const ext = format === 'jpeg' ? 'jpg' : format;
    const s3Key = `profiles/${profil.id}/${randomUUID()}.${ext}`;
    const contentType = `image/${format === 'jpeg' ? 'jpeg' : format}` as
      | 'image/jpeg'
      | 'image/png'
      | 'image/webp';

    const sagaResult = await this.runUploadSaga({
      profilId: profil.id,
      s3Key,
      contentType,
      width,
      height,
      buffer: input.fileBuffer,
    });
    if (!sagaResult.ok) return sagaResult;

    // 6. FIFO eviction (best-effort)
    const versionsHistorique = await this.evictFifo(profil.id);

    // 7. Recalcul statut + invalidations (best-effort)
    await this.postUpload(input.authUserId);

    // 8. Audit
    await this.audit.append({
      eventType: 'signup',
      actorUserId: input.authUserId,
      targetUserId: input.authUserId,
      actorIp: input.actorIp ?? null,
      metadata: {
        action: 'profil.photo.uploadee',
        s3Key,
        contentType,
        width,
        height,
        versionsHistorique,
      },
    });

    return ok({
      photoS3Key: s3Key,
      photoUrlPublique: this.buildPublicUrl(s3Key),
      photoWidth: width,
      photoHeight: height,
      versionsHistorique,
    });
  }

  private async validerFichier(
    buffer: Buffer,
  ): Promise<
    Result<{ format: 'jpeg' | 'png' | 'webp'; width: number; height: number }, UploaderPhotoError>
  > {
    if (buffer.length > MAX_PHOTO_SIZE_BYTES) {
      return err({
        kind: 'TAILLE_DEPASSE' as const,
        tailleOctets: buffer.length,
        limiteOctets: MAX_PHOTO_SIZE_BYTES,
      });
    }
    const format = detecterFormatImage(buffer);
    if (!format) {
      return err({ kind: 'FORMAT_NON_SUPPORTE' as const, formatDetecte: null });
    }
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      return err({ kind: 'CONTENU_NON_IMAGE' as const });
    }
    if (!metadata.width || !metadata.height) {
      return err({ kind: 'CONTENU_NON_IMAGE' as const });
    }
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      return err({
        kind: 'DIMENSIONS_DEPASSE' as const,
        width: metadata.width,
        height: metadata.height,
      });
    }
    return ok({ format, width: metadata.width, height: metadata.height });
  }

  private async runUploadSaga(args: {
    profilId: string;
    s3Key: string;
    contentType: 'image/jpeg' | 'image/png' | 'image/webp';
    width: number;
    height: number;
    buffer: Buffer;
  }): Promise<Result<void, UploaderPhotoError>> {
    const historiqueId = await this.historique.insertPending({
      profileId: args.profilId,
      s3Key: args.s3Key,
      width: args.width,
      height: args.height,
      contentType: args.contentType,
    });

    try {
      await this.storage.upload({
        key: args.s3Key,
        buffer: args.buffer,
        contentType: args.contentType,
      });
    } catch (e) {
      this.logger.error({ err: e, s3Key: args.s3Key }, 'S3 upload failed — rollback row');
      await this.historique.deletePending(historiqueId).catch(() => undefined);
      return err({ kind: 'STORAGE_HS' as const });
    }

    try {
      await prisma.$transaction(async (tx) => {
        await this.historique.markCommit(historiqueId, tx);
        await this.profilRepo.updatePhoto(
          {
            id: args.profilId,
            photoS3Key: args.s3Key,
            photoWidth: args.width,
            photoHeight: args.height,
            photoContentType: args.contentType,
          },
          tx,
        );
      });
      return ok(undefined);
    } catch (e) {
      this.logger.error({ err: e, s3Key: args.s3Key }, 'DB commit failed — S3 compensation');
      await this.storage.delete(args.s3Key).catch(() => undefined);
      await this.historique.deletePending(historiqueId).catch(() => undefined);
      return err({ kind: 'STORAGE_HS' as const });
    }
  }

  private async evictFifo(profilId: string): Promise<number> {
    const commits = await this.historique.findCommitsByProfile(profilId);
    if (commits.length <= FIFO_MAX_PHOTOS) return commits.length;
    const aEvincer = commits.slice(FIFO_MAX_PHOTOS);
    for (const evict of aEvincer) {
      await this.historique.markEvicted(evict.id).catch(() => undefined);
      await this.storage.delete(evict.s3Key).catch(() => undefined);
    }
    return FIFO_MAX_PHOTOS;
  }

  private async postUpload(authUserId: string): Promise<void> {
    const updated = await this.profilRepo.findByAuthUserId(authUserId);
    if (!updated) return;
    const conformiteVerified = await this.safeConformite(authUserId);
    const nouveauStatut = this.computeStatut(updated, conformiteVerified);
    if (nouveauStatut !== updated.statut && nouveauStatut !== 'anonymise') {
      await this.profilRepo.updateStatut({
        id: updated.id,
        statut: nouveauStatut as 'incomplet' | 'pret' | 'masque_admin',
      });
    }
    if (updated.slug) {
      await this.cdnInvalidator
        .invalidatePaths([`/fr/conseiller/${updated.slug}`, `/en/conseiller/${updated.slug}`])
        .catch(() => undefined);
    }
  }

  private async safeConformite(authUserId: string): Promise<boolean> {
    try {
      const status = await this.conformite.getVerificationStatus({
        conseillerId: authUserId,
        strict: false,
      });
      return status.verified;
    } catch {
      return false;
    }
  }

  private computeStatut(
    updated: {
      titre: string | null;
      biographie: string | null;
      specialitesCodes: readonly string[];
      languesCodes: readonly string[];
      zonesGeographiquesCodes: readonly string[];
      anneesExperience: number | null;
      photoS3Key: string | null;
      statut: string;
    },
    conformiteVerified: boolean,
  ): 'incomplet' | 'pret' | 'masque_admin' | 'anonymise' {
    const complet = profilEstComplet({
      titre: updated.titre,
      biographie: updated.biographie,
      specialitesCount: updated.specialitesCodes.length,
      languesCount: updated.languesCodes.length,
      zonesGeographiquesCount: updated.zonesGeographiquesCodes.length,
      anneesExperience: updated.anneesExperience,
      photoS3Key: updated.photoS3Key,
    });
    return calculerStatutProfil({
      verifie: conformiteVerified,
      profilComplet: complet,
      masqueAdmin: updated.statut === 'masque_admin',
      anonymise: false,
    });
  }

  private buildPublicUrl(s3Key: string): string {
    const base = env.CLOUDFRONT_PROFILES_PUBLIC_URL.replace(/\/+$/, '');
    return `${base}/${s3Key}`;
  }
}
