// T129 — AnonymiserProfilLoi25UseCase (feature 007 US5 FR-016).
//
// Orchestré par feature 023 future (effacement Loi 25 cross-module).
// Idempotent : ré-appel sur profil déjà anonymisé = no-op.
//
// Actions :
//   1. DELETE S3 (photo courante + historique FIFO)
//   2. anonymize() repo : NULL champs PII + sets vides + statut anonymise
//   3. SlugReservation : conserve le slug à vie (FR-015 SC-007),
//      conseillerIdOrigine = NULL (ADR-0015)
//   4. Annulation relances onboarding
//   5. Audit append-only

import { prisma } from '@cv/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { ProfilCacheInvalidator } from '../listeners/profil-cache-invalidation.listener';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import {
  ONBOARDING_RELANCE_SCHEDULER,
  type OnboardingRelanceScheduler,
} from '../ports/onboarding-relance-scheduler.port';
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
  SLUG_RESERVATION_REPOSITORY,
  type SlugReservationRepository,
} from '../ports/slug-reservation-repository.port';

export interface AnonymiserProfilLoi25Input {
  readonly conseillerProfileId: string;
  readonly orchestrateurReference: string;
}

@Injectable()
export class AnonymiserProfilLoi25UseCase {
  private readonly logger = new Logger('AnonymiserProfilLoi25UseCase');

  constructor(
    @Inject(PROFIL_CONSEILLER_REPOSITORY)
    private readonly profilRepo: ProfilConseillerRepository,
    @Inject(PHOTO_HISTORIQUE_REPOSITORY)
    private readonly historique: PhotoHistoriqueRepository,
    @Inject(PHOTO_STORAGE)
    private readonly storage: PhotoStorage,
    @Inject(SLUG_RESERVATION_REPOSITORY)
    private readonly slugReservation: SlugReservationRepository,
    @Inject(ONBOARDING_RELANCE_SCHEDULER)
    private readonly relanceScheduler: OnboardingRelanceScheduler,
    @Inject(AUTH_AUDIT_WRITER)
    private readonly authAudit: AuthAuditWriter,
    private readonly cacheInvalidator: ProfilCacheInvalidator,
  ) {}

  async execute(input: AnonymiserProfilLoi25Input): Promise<void> {
    const profil = await this.profilRepo.findById(input.conseillerProfileId);
    if (!profil) {
      this.logger.warn({ id: input.conseillerProfileId }, 'Profil introuvable — no-op');
      return;
    }
    if (profil.statut === 'anonymise') {
      this.logger.log({ id: profil.id }, 'Profil déjà anonymisé — no-op idempotent');
      return;
    }

    // 1. DELETE S3 best-effort (photo courante + historique non-évincée)
    await this.deleteAllS3Photos(profil.id, profil.photoS3Key);

    // 2. Transaction Postgres : anonymize repo + reserve slug
    await prisma.$transaction(async (tx) => {
      await this.profilRepo.anonymize(profil.id, tx);
      if (profil.slug) {
        await this.slugReservation.reserve(
          { slug: profil.slug, raison: 'loi25', conseillerIdOrigine: null },
          tx,
        );
      }
    });

    // 3. Annulation relances (best-effort)
    await this.relanceScheduler.annulerRelances(profil.id).catch(() => undefined);

    // 4. Audit immutable
    await this.authAudit.append({
      eventType: 'signup',
      targetUserId: profil.authUserId,
      metadata: {
        action: 'profil.anonymise.loi25',
        orchestrateurReference: input.orchestrateurReference,
        slugReserve: profil.slug,
      },
    });

    // 5. Invalidations cache (page publique disparaît + sitemap)
    if (profil.slug) {
      await this.cacheInvalidator.invalidateProfilSlug(profil.slug);
    }
    await this.cacheInvalidator.invalidateSitemap();
  }

  private async deleteAllS3Photos(profilId: string, currentKey: string | null): Promise<void> {
    const allPhotos = await this.historique.findAllNonEvictedByProfile(profilId);
    const keys = new Set<string>();
    if (currentKey) keys.add(currentKey);
    for (const p of allPhotos) keys.add(p.s3Key);
    await Promise.all(
      [...keys].map((key) =>
        this.storage
          .delete(key)
          .catch((err) => this.logger.warn({ err, key }, 'S3 delete failed during anonymisation')),
      ),
    );
  }
}
