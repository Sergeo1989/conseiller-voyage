// T144 — CleanupOrphanPhotosJob (feature 007 Phase 10, C4 compensation).
//
// Tourne quotidiennement à 03:00 UTC. Compensation S3↔DB :
//   1. Liste les ProfilePhotoHistory en statut `pending_upload` plus
//      anciennes que 1h (PUT S3 sans COMMIT DB — abandonnés).
//   2. Pour chacune, tente DELETE S3 (best-effort) puis DELETE row DB.
//
// Filet de sécurité contre les uploads "à moitié faits" suite à un crash
// du worker entre PUT S3 et UPDATE DB.

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PHOTO_HISTORIQUE_REPOSITORY,
  type PhotoHistoriqueRepository,
} from '../../application/ports/photo-historique-repository.port';
import { PHOTO_STORAGE, type PhotoStorage } from '../../application/ports/photo-storage.port';

const PENDING_GRACE_MS = 60 * 60 * 1000; // 1h

@Injectable()
export class CleanupOrphanPhotosJob {
  private readonly logger = new Logger(CleanupOrphanPhotosJob.name);
  private running = false;

  constructor(
    @Inject(PHOTO_HISTORIQUE_REPOSITORY)
    private readonly historique: PhotoHistoriqueRepository,
    @Inject(PHOTO_STORAGE)
    private readonly storage: PhotoStorage,
  ) {}

  async sweep(): Promise<void> {
    if (this.running) {
      this.logger.warn('CleanupOrphanPhotos already running — skip');
      return;
    }
    this.running = true;
    try {
      const cutoff = new Date(Date.now() - PENDING_GRACE_MS);
      const orphans = await this.historique.findOlderPendingThan(cutoff);
      let cleaned = 0;
      for (const o of orphans) {
        await this.storage
          .delete(o.s3Key)
          .catch((err) =>
            this.logger.warn({ err, key: o.s3Key }, 'S3 delete failed during cleanup'),
          );
        await this.historique
          .deletePending(o.id)
          .catch((err) => this.logger.warn({ err, id: o.id }, 'DB delete failed during cleanup'));
        cleaned++;
      }
      if (cleaned > 0) {
        this.logger.log(`CleanupOrphanPhotos done: cleaned=${cleaned}`);
      }
    } finally {
      this.running = false;
    }
  }
}
