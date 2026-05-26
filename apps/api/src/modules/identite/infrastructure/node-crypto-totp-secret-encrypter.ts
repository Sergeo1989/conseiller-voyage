// Adapter chiffrement AES-256-GCM via @cv/mfa/encryption.
// Lit MFA_KEK_BASE64 depuis env.ts au moment de l'instanciation.

import { decrypt as mfaDecrypt, encrypt as mfaEncrypt } from '@cv/mfa';
import { Inject, Injectable } from '@nestjs/common';
import type { Env } from '../../../env';
import type { TotpSecretEncrypter } from '../application/ports/totp-secret-encrypter.port';
import type { EncryptedTotpSecret } from '../domain/value-objects/encrypted-totp-secret.vo';

export const ENV_TOKEN = Symbol.for('Env');

@Injectable()
export class NodeCryptoTotpSecretEncrypter implements TotpSecretEncrypter {
  private readonly kek: string;

  constructor(@Inject(ENV_TOKEN) env: Env) {
    this.kek = env.MFA_KEK_BASE64;
  }

  encrypt(plaintextSecret: string): EncryptedTotpSecret {
    return mfaEncrypt(plaintextSecret, this.kek);
  }

  decrypt(encrypted: EncryptedTotpSecret): string {
    return mfaDecrypt(encrypted, this.kek);
  }
}
