// T115 — UploadIntentCleanupJob (Phase N).
//
// Tourne quotidiennement (02:30 après ExpirationSweep). Supprime les
// UploadIntent qui sont :
//   - expirés (expiresAt < now - 7 jours de marge)
//   - jamais consommés (consumedAt = null)
//
// Et leurs objets S3 associés (si l'upload S3 a réellement eu lieu
// mais sans submission qui suit). La S3 lifecycle policy (T117) sert
// de filet de sécurité côté infra.

import { prisma } from '@cv/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import {
  CONFORMITE_READER,
  type ConformiteReader,
} from '../../application/ports/conformite-reader.port';
import {
  DOCUMENT_STORAGE,
  type DocumentStoragePort,
} from '../../application/ports/document-storage.port';

const GRACE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class UploadIntentCleanupJob {
  private readonly logger = new Logger(UploadIntentCleanupJob.name);
  private running = false;

  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async sweep(): Promise<void> {
    if (this.running) {
      this.logger.warn('UploadIntentCleanup already running — skipping.');
      return;
    }
    this.running = true;
    try {
      const { staleCount, s3DeleteCount } = await this.processBatch();
      this.logger.log(
        `UploadIntentCleanup done: ${staleCount} intents deleted, ${s3DeleteCount} S3 objects deleted.`,
      );
    } catch (error) {
      this.logger.error(
        `UploadIntentCleanup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async processBatch(): Promise<{ staleCount: number; s3DeleteCount: number }> {
    const threshold = new Date(this.clock.now().getTime() - GRACE_DAYS * MS_PER_DAY);
    const stale = await this.reader.listExpiredUnconsumedUploadIntents(threshold);

    let s3DeleteCount = 0;
    for (const intent of stale) {
      const deleted = await this.tryDeleteS3(intent.objectKey);
      if (deleted) s3DeleteCount += 1;
    }

    if (stale.length > 0) {
      await prisma.uploadIntent.deleteMany({
        where: { id: { in: stale.map((i) => i.id) } },
      });
    }

    return { staleCount: stale.length, s3DeleteCount };
  }

  private async tryDeleteS3(objectKey: string): Promise<boolean> {
    try {
      await this.storage.deleteObject(objectKey);
      return true;
    } catch (error) {
      this.logger.warn(
        `S3 delete failed for ${objectKey} (lifecycle policy will catch up): ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
