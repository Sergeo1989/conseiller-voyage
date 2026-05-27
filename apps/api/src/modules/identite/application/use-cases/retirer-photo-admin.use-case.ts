// T116 — RetirerPhotoAdminUseCase (feature 007 US6 FR-023).
//
// Action admin destructive : supprime la photo S3 (courante + historique
// FIFO) + bascule statut profil → incomplet + audit immutable + email
// au conseiller (T120).

import { prisma } from '@cv/db';
import { type Result, err, ok } from '@cv/profil-domain';
import { Inject, Injectable, Logger } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { ProfilCacheInvalidator } from '../listeners/profil-cache-invalidation.listener';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import {
  PHOTO_HISTORIQUE_REPOSITORY,
  type PhotoHistoriqueRepository,
} from '../ports/photo-historique-repository.port';
import { PHOTO_STORAGE, type PhotoStorage } from '../ports/photo-storage.port';
import {
  PROFIL_CONSEILLER_REPOSITORY,
  type ProfilConseillerRepository,
} from '../ports/profil-conseiller-repository.port';
import {
  PROFIL_MODERATION_AUDIT_WRITER,
  type ProfilModerationAuditWriter,
} from '../ports/profil-moderation-audit-writer.port';

export interface RetirerPhotoAdminInput {
  readonly adminAuthUserId: string;
  readonly adminEmail: string;
  readonly conseillerProfileId: string;
  readonly raison: string;
}

export interface RetirerPhotoAdminSuccess {
  readonly photoSupprimees: number;
}

export type RetirerPhotoAdminError =
  | { kind: 'PROFIL_NOT_FOUND' }
  | { kind: 'PROFIL_ANONYMISE' }
  | { kind: 'AUCUNE_PHOTO' }
  | { kind: 'RAISON_TROP_COURTE' };

@Injectable()
export class RetirerPhotoAdminUseCase {
  private readonly logger = new Logger('RetirerPhotoAdminUseCase');

  constructor(
    @Inject(PROFIL_CONSEILLER_REPOSITORY)
    private readonly profilRepo: ProfilConseillerRepository,
    @Inject(PHOTO_HISTORIQUE_REPOSITORY)
    private readonly historique: PhotoHistoriqueRepository,
    @Inject(PHOTO_STORAGE)
    private readonly storage: PhotoStorage,
    @Inject(PROFIL_MODERATION_AUDIT_WRITER)
    private readonly moderationAudit: ProfilModerationAuditWriter,
    @Inject(AUTH_AUDIT_WRITER)
    private readonly authAudit: AuthAuditWriter,
    private readonly cacheInvalidator: ProfilCacheInvalidator,
  ) {}

  async execute(
    input: RetirerPhotoAdminInput,
  ): Promise<Result<RetirerPhotoAdminSuccess, RetirerPhotoAdminError>> {
    if (input.raison.trim().length < 10) {
      return err({ kind: 'RAISON_TROP_COURTE' as const });
    }
    const profil = await this.profilRepo.findById(input.conseillerProfileId);
    if (!profil) return err({ kind: 'PROFIL_NOT_FOUND' as const });
    if (profil.statut === 'anonymise') return err({ kind: 'PROFIL_ANONYMISE' as const });
    if (!profil.photoS3Key) return err({ kind: 'AUCUNE_PHOTO' as const });

    const allPhotos = await this.historique.findAllNonEvictedByProfile(profil.id);
    const s3Keys = allPhotos.map((p) => p.s3Key);
    if (profil.photoS3Key && !s3Keys.includes(profil.photoS3Key)) {
      s3Keys.push(profil.photoS3Key);
    }

    // Suppression S3 best-effort en parallèle
    await Promise.all(
      s3Keys.map((key) =>
        this.storage
          .delete(key)
          .catch((e) =>
            this.logger.warn({ err: e, key }, 'S3 delete failed during admin retirer photo'),
          ),
      ),
    );

    // Transaction Postgres : clearPhoto + statut + audit modération
    await prisma.$transaction(async (tx) => {
      await this.profilRepo.clearPhoto(profil.id, tx);
      await this.profilRepo.updateStatut({ id: profil.id, statut: 'incomplet' }, tx);
      for (const h of allPhotos) {
        await this.historique.markEvicted(h.id, tx);
      }
      await this.moderationAudit.append(
        {
          profileId: profil.id,
          adminAuthUserId: input.adminAuthUserId,
          adminEmail: input.adminEmail,
          action: 'retrait_photo',
          raison: input.raison,
          metadonneesJson: { photosSupprimees: s3Keys.length },
        },
        tx,
      );
    });

    await this.authAudit.append({
      eventType: 'signup',
      actorUserId: input.adminAuthUserId,
      targetUserId: profil.authUserId,
      metadata: { action: 'profil.photo.retiree.admin', raison: input.raison },
    });

    // Invalidations cache (page publique disparaît si statut → incomplet)
    if (profil.slug) {
      await this.cacheInvalidator.invalidateProfilSlug(profil.slug);
    }

    return ok({ photoSupprimees: s3Keys.length });
  }
}
