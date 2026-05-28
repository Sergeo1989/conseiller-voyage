// T142 — Tests intégration CleanupOrphanPhotosJob (feature 007 Phase 10, C4 compensation).
//
// Couvre :
//   (a) Row pending_upload > 1h → DELETE row + delete S3 best-effort
//   (b) Row pending_upload < 1h (upload en cours) → préservée
//   (c) Row commit (upload terminé) → préservée
//   (d) Réentrance : 2 sweep() concurrents → seul le 1er nettoie (flag running)

import { prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoStorage } from '../../../src/modules/identite/application/ports/photo-storage.port';
import { CleanupOrphanPhotosJob } from '../../../src/modules/identite/infrastructure/jobs/cleanup-orphan-photos.job';
import { PrismaPhotoHistoriqueRepository } from '../../../src/modules/identite/infrastructure/prisma-photo-historique-repository';
import { buildUuid, cleanupByUuidPrefix, seedAuthUser, seedProfil } from './_helpers';

const PREFIX = 'c03';
const ONE_HOUR_MS = 60 * 60 * 1000;

function buildJob(storage: PhotoStorage = makeStorageStub()): {
  job: CleanupOrphanPhotosJob;
  storage: PhotoStorage;
} {
  const job = new CleanupOrphanPhotosJob(new PrismaPhotoHistoriqueRepository(), storage);
  return { job, storage };
}

function makeStorageStub(): PhotoStorage {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    listKeysWithPrefix: vi.fn().mockResolvedValue([]),
  };
}

async function seedPendingPhoto(
  profileId: string,
  s3Key: string,
  uploadedAt: Date,
): Promise<string> {
  const row = await prisma.profilePhotoHistory.create({
    data: {
      profileId,
      s3Key,
      statut: 'pending_upload',
      uploadedAt,
      width: 800,
      height: 800,
      contentType: 'image/jpeg',
    },
    select: { id: true },
  });
  return row.id;
}

async function seedCommittedPhoto(
  profileId: string,
  s3Key: string,
  uploadedAt: Date,
): Promise<string> {
  const row = await prisma.profilePhotoHistory.create({
    data: {
      profileId,
      s3Key,
      statut: 'commit',
      uploadedAt,
      committedAt: new Date(),
      width: 800,
      height: 800,
      contentType: 'image/jpeg',
    },
    select: { id: true },
  });
  return row.id;
}

describe('CleanupOrphanPhotosJob (T142)', () => {
  beforeEach(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  afterAll(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  it('row pending_upload > 1h → DELETE row + delete S3 best-effort', async () => {
    const authUserId = buildUuid(PREFIX, '00000001');
    const profilId = buildUuid(PREFIX, '10000001');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedProfil({ id: profilId, authUserId });

    const stale = new Date(Date.now() - ONE_HOUR_MS - 60_000); // 1h + 1min ago
    const photoId = await seedPendingPhoto(profilId, 'profiles/stale.jpg', stale);

    const { job, storage } = buildJob();
    await job.sweep();

    // Row supprimée
    const after = await prisma.profilePhotoHistory.findUnique({ where: { id: photoId } });
    expect(after).toBeNull();
    // S3 delete appelé
    expect(storage.delete).toHaveBeenCalledWith('profiles/stale.jpg');
  });

  it('row pending_upload < 1h → préservée (upload en cours)', async () => {
    const authUserId = buildUuid(PREFIX, '00000002');
    const profilId = buildUuid(PREFIX, '10000002');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedProfil({ id: profilId, authUserId });

    const recent = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    const photoId = await seedPendingPhoto(profilId, 'profiles/recent.jpg', recent);

    const { job, storage } = buildJob();
    await job.sweep();

    const after = await prisma.profilePhotoHistory.findUnique({ where: { id: photoId } });
    expect(after).not.toBeNull();
    expect(after?.statut).toBe('pending_upload');
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('row commit → préservée (upload terminé)', async () => {
    const authUserId = buildUuid(PREFIX, '00000003');
    const profilId = buildUuid(PREFIX, '10000003');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedProfil({ id: profilId, authUserId });

    const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 jours
    const photoId = await seedCommittedPhoto(profilId, 'profiles/committed.jpg', old);

    const { job, storage } = buildJob();
    await job.sweep();

    const after = await prisma.profilePhotoHistory.findUnique({ where: { id: photoId } });
    expect(after).not.toBeNull();
    expect(after?.statut).toBe('commit');
    expect(storage.delete).not.toHaveBeenCalledWith('profiles/committed.jpg');
  });

  it('réentrance : 2 sweeps concurrents → seul le 1er nettoie (flag running)', async () => {
    const authUserId = buildUuid(PREFIX, '00000004');
    const profilId = buildUuid(PREFIX, '10000004');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedProfil({ id: profilId, authUserId });

    const stale = new Date(Date.now() - ONE_HOUR_MS - 60_000);
    await seedPendingPhoto(profilId, 'profiles/race-1.jpg', stale);

    // Storage qui met du temps à répondre — laisse le 2e sweep démarrer
    const slowStorage: PhotoStorage = {
      upload: vi.fn().mockResolvedValue(undefined),
      listKeysWithPrefix: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100))),
    };
    const job = new CleanupOrphanPhotosJob(new PrismaPhotoHistoriqueRepository(), slowStorage);

    // Lance 2 sweeps en // : le 2e doit early-exit via le flag running
    await Promise.all([job.sweep(), job.sweep()]);

    // Le delete S3 ne doit avoir été appelé qu'une seule fois (run unique)
    expect(slowStorage.delete).toHaveBeenCalledTimes(1);
  });
});
