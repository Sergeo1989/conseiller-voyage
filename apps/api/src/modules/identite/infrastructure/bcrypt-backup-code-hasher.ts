// Adapter bcrypt via @cv/mfa/backup-codes.

import { hashCode, verifyCode } from '@cv/mfa';
import { Injectable } from '@nestjs/common';
import type { BackupCodeHasher } from '../application/ports/backup-code-hasher.port';
import type { BackupCodeHash } from '../domain/value-objects/backup-code-hash.vo';

@Injectable()
export class BcryptBackupCodeHasher implements BackupCodeHasher {
  hash(plaintextCode: string): Promise<BackupCodeHash> {
    return hashCode(plaintextCode);
  }

  verify(plaintextCode: string, hash: BackupCodeHash): Promise<boolean> {
    return verifyCode(plaintextCode, hash);
  }
}
