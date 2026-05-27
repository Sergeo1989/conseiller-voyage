// Chiffrement AES-256-GCM du secret TOTP au repos.
// Cf. ADR-0010 (choix algorithme + format) et
// specs/005-mfa-conseiller/contracts/mfa-encrypter.port.md.
//
// Format sérialisé :
//   ┌───────────┬────────────────┬───────────────────┬──────────────────┐
//   │ version   │ iv (12 bytes)  │ ciphertext        │ auth tag (16 B)  │
//   │ 1 byte    │ random nonce   │ AES-256-GCM       │ GMAC             │
//   └───────────┴────────────────┴───────────────────┴──────────────────┘
//   → encodé Base64 standard, sans saut de ligne.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { KekInvalidSizeError, TotpSecretFormatError, TotpSecretIntegrityError } from './errors';

const VERSION_BYTE = 0x01;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEK_BYTES = 32;
const MIN_BLOB_BYTES = 1 + IV_BYTES + 1 + AUTH_TAG_BYTES; // version + iv + au moins 1 byte ct + tag

/** Branded type pour le ciphertext sérialisé. */
export type EncryptedTotpSecret = string & { readonly __brand: 'EncryptedTotpSecret' };

function decodeKek(kekBase64: string): Buffer {
  const buf = Buffer.from(kekBase64, 'base64');
  if (buf.length !== KEK_BYTES) {
    throw new KekInvalidSizeError(buf.length);
  }
  return buf;
}

/**
 * Chiffre un secret TOTP Base32 clair en AES-256-GCM avec la KEK
 * fournie. Génère un IV aléatoire à chaque appel — jamais réutilisé.
 *
 * @throws KekInvalidSizeError si la KEK ne fait pas 32 octets.
 */
export function encrypt(plaintextSecret: string, kekBase64: string): EncryptedTotpSecret {
  const kek = decodeKek(kekBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', kek, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintextSecret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes par défaut

  const blob = Buffer.concat([Buffer.from([VERSION_BYTE]), iv, ciphertext, authTag]);

  return blob.toString('base64') as EncryptedTotpSecret;
}

/**
 * Déchiffre une chaîne précédemment produite par `encrypt`. Vérifie
 * l'auth tag GCM — toute altération est détectée.
 *
 * @throws TotpSecretIntegrityError si auth tag invalide (corruption,
 *         altération malveillante, ou mauvaise KEK).
 * @throws TotpSecretFormatError    si format sérialisé invalide.
 * @throws KekInvalidSizeError      si la KEK ne fait pas 32 octets.
 */
export function decrypt(encrypted: EncryptedTotpSecret, kekBase64: string): string {
  const kek = decodeKek(kekBase64);

  let blob: Buffer;
  try {
    blob = Buffer.from(encrypted, 'base64');
  } catch {
    throw new TotpSecretFormatError('invalid base64');
  }

  // Vérifier que le decoded a la bonne taille minimale.
  if (blob.length < MIN_BLOB_BYTES) {
    throw new TotpSecretFormatError(`blob too short (${blob.length} bytes)`);
  }

  // Vérifier que la chaîne base64 a effectivement été décodée à du
  // contenu utile. `Buffer.from(invalid, 'base64')` retourne un Buffer
  // partiel sans throw — un blob bidon non-base64 décode en quelques
  // octets aléatoires. Heuristique : si la chaîne ne matche pas le
  // pattern base64, rejeter.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted)) {
    throw new TotpSecretFormatError('invalid base64 charset');
  }

  const version = blob[0];
  if (version !== VERSION_BYTE) {
    throw new TotpSecretFormatError(`unsupported version 0x${version?.toString(16) ?? '??'}`);
  }

  const iv = blob.subarray(1, 1 + IV_BYTES);
  const authTag = blob.subarray(blob.length - AUTH_TAG_BYTES);
  const ciphertext = blob.subarray(1 + IV_BYTES, blob.length - AUTH_TAG_BYTES);

  const decipher = createDecipheriv('aes-256-gcm', kek, iv);
  decipher.setAuthTag(authTag);

  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    // Node throw une erreur générique sur auth tag invalide.
    throw new TotpSecretIntegrityError();
  }
}

// Re-export des erreurs typées pour faciliter le filtrage côté caller.
export { KekInvalidSizeError, TotpSecretFormatError, TotpSecretIntegrityError };
