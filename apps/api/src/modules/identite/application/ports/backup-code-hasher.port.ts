// Port BackupCodeHasher — hash bcrypt + vérification d'un code clair.
// Cf. contracts/backup-code-hasher.port.md.

import type { BackupCodeHash } from '../../domain/value-objects/backup-code-hash.vo';

export interface BackupCodeHasher {
  /** Hash bcrypt cost ≥ 12 d'un code clair normalisé. */
  hash(plaintextCode: string): Promise<BackupCodeHash>;

  /** Comparaison constant-time entre un code clair et un hash. */
  verify(plaintextCode: string, hash: BackupCodeHash): Promise<boolean>;
}

export const BACKUP_CODE_HASHER = Symbol.for('BackupCodeHasher');
