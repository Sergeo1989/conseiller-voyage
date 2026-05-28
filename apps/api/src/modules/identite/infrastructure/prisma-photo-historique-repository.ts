// T037 — PrismaPhotoHistoriqueRepository (feature 007).
//
// Impl du port PhotoHistoriqueRepository (T027). Saga upload photo :
// insertPending → PUT S3 → markCommit (transaction). En cas d'échec
// PUT S3, deletePending nettoie. Le worker cleanup-orphan-photos (T144)
// scrute findOlderPendingThan pour rollback automatique.

import { type Prisma, prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  InsertPendingInput,
  PhotoHistoriqueEntry,
  PhotoHistoriqueRepository,
} from '../application/ports/photo-historique-repository.port';

type Db = Prisma.TransactionClient | typeof prisma;

@Injectable()
export class PrismaPhotoHistoriqueRepository implements PhotoHistoriqueRepository {
  private db(tx?: Prisma.TransactionClient): Db {
    return tx ?? prisma;
  }

  async insertPending(input: InsertPendingInput, tx?: Prisma.TransactionClient): Promise<string> {
    const row = await this.db(tx).profilePhotoHistory.create({
      data: {
        profileId: input.profileId,
        s3Key: input.s3Key,
        width: input.width,
        height: input.height,
        contentType: input.contentType,
        // statut par défaut = pending_upload
      },
      select: { id: true },
    });
    return row.id;
  }

  async markCommit(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).profilePhotoHistory.update({
      where: { id },
      data: { statut: 'commit', committedAt: new Date() },
    });
  }

  async deletePending(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    // DELETE est autorisé sur profile_photo_history (pas de trigger
    // append-only) — utilisé uniquement pour la compensation post-échec
    // PUT S3 sur une ligne statut='pending_upload'.
    await this.db(tx).profilePhotoHistory.delete({ where: { id } });
  }

  async markEvicted(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).profilePhotoHistory.update({
      where: { id },
      data: { statut: 'evicted', evictedAt: new Date() },
    });
  }

  async findCommitsByProfile(profileId: string): Promise<readonly PhotoHistoriqueEntry[]> {
    const rows = await prisma.profilePhotoHistory.findMany({
      where: { profileId, statut: 'commit' },
      orderBy: { uploadedAt: 'desc' },
    });
    return rows.map(this.toEntry);
  }

  async findAllNonEvictedByProfile(profileId: string): Promise<readonly PhotoHistoriqueEntry[]> {
    const rows = await prisma.profilePhotoHistory.findMany({
      where: { profileId, statut: { in: ['commit', 'pending_upload'] } },
      orderBy: { uploadedAt: 'desc' },
    });
    return rows.map(this.toEntry);
  }

  async findOlderPendingThan(cutoff: Date): Promise<readonly PhotoHistoriqueEntry[]> {
    const rows = await prisma.profilePhotoHistory.findMany({
      where: { statut: 'pending_upload', uploadedAt: { lt: cutoff } },
      orderBy: { uploadedAt: 'asc' },
    });
    return rows.map(this.toEntry);
  }

  private toEntry = (row: {
    id: string;
    profileId: string;
    s3Key: string;
    statut: 'pending_upload' | 'commit' | 'evicted';
    width: number | null;
    height: number | null;
    contentType: string | null;
    uploadedAt: Date;
    committedAt: Date | null;
    evictedAt: Date | null;
  }): PhotoHistoriqueEntry => row;
}
