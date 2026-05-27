// T027 — Port repository de l'historique photos FIFO (feature 007, FR-004 + C4).
//
// Saga upload (cf. contracts/profil-edition.port.md) :
//   1. insertPending → ligne pending_upload AVANT PUT S3
//   2. PUT S3
//   3. markCommit → statut commit (transaction Postgres avec update profil)
//   4. FIFO eviction : si > 5 entrées 'commit', éviction des plus anciennes
//
// Le worker cleanup-orphan-photos (T144) scrute les rows pending_upload
// vieilles de > 1h pour rollback (compensation).

import type { PhotoUploadStatut, Prisma } from '@cv/db';

export interface PhotoHistoriqueEntry {
  readonly id: string;
  readonly profileId: string;
  readonly s3Key: string;
  readonly statut: PhotoUploadStatut;
  readonly width: number | null;
  readonly height: number | null;
  readonly contentType: string | null;
  readonly uploadedAt: Date;
  readonly committedAt: Date | null;
  readonly evictedAt: Date | null;
}

export interface InsertPendingInput {
  readonly profileId: string;
  readonly s3Key: string;
  readonly width: number;
  readonly height: number;
  readonly contentType: string;
}

export interface PhotoHistoriqueRepository {
  /** Pré-insert avant PUT S3 (saga step 1). */
  insertPending(input: InsertPendingInput, tx?: Prisma.TransactionClient): Promise<string>;
  /** Bascule statut → commit (saga step 3, en transaction avec updatePhoto). */
  markCommit(id: string, tx?: Prisma.TransactionClient): Promise<void>;
  /** Supprime la ligne pending_upload après échec PUT S3 (compensation). */
  deletePending(id: string, tx?: Prisma.TransactionClient): Promise<void>;
  /** Bascule statut → evicted (FIFO ou anonymisation). */
  markEvicted(id: string, tx?: Prisma.TransactionClient): Promise<void>;

  /** Lit les commits par profil, plus récent en premier. Pour FIFO eviction. */
  findCommitsByProfile(profileId: string): Promise<readonly PhotoHistoriqueEntry[]>;
  /** Lit toutes les photos non-évincées d'un profil. Pour anonymisation Loi 25. */
  findAllNonEvictedByProfile(profileId: string): Promise<readonly PhotoHistoriqueEntry[]>;
  /** Lit les pending_upload plus anciennes que cutoff (cleanup orphans worker). */
  findOlderPendingThan(cutoff: Date): Promise<readonly PhotoHistoriqueEntry[]>;
}

export const PHOTO_HISTORIQUE_REPOSITORY = Symbol.for('PhotoHistoriqueRepository');
