// Génération + hashing des codes de récupération MFA.
// Cf. specs/005-mfa-conseiller/contracts/backup-code-hasher.port.md.
//
// Format : XXXX-XXXX-XX (10 caractères significatifs + 2 tirets).
// Alphabet sans confusion visuelle : A-Z + 2-9, exclut 0, O, 1, I, L.

import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 symboles, sans 0,O,1,I,L
const CODE_LENGTH = 10; // 10 chars significatifs, ~50 bits d'entropie
const BATCH_SIZE = 10; // 10 codes par lot (FR-004)
const BCRYPT_COST = 12; // ≥ 12 exigé par ADR-0011

/** Regex de validation côté serveur ET côté client. */
export const BACKUP_CODE_REGEX = /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{2}$/;

/** Branded type pour un hash bcrypt. */
export type BackupCodeHash = string & { readonly __brand: 'BackupCodeHash' };

/**
 * Génère un seul code clair au format XXXX-XXXX-XX en utilisant une
 * entropie cryptographique (`crypto.randomInt`, pas `Math.random`).
 */
function generateOne(): string {
  const chars = Array.from({ length: CODE_LENGTH }, () => {
    const idx = randomInt(0, ALPHABET.length);
    return ALPHABET[idx];
  }).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 10)}`;
}

/**
 * Génère un lot de 10 codes de récupération distincts au format
 * XXXX-XXXX-XX. Aucune collision sur 1000 lots × 10 codes = 1000 codes
 * (~50 bits d'entropie chacun → collision birthday vers 2^25 codes).
 */
export function generateBatch(): string[] {
  const set = new Set<string>();
  while (set.size < BATCH_SIZE) {
    set.add(generateOne());
  }
  return Array.from(set);
}

/**
 * Normalise un code saisi par l'utilisateur : force la casse en
 * majuscules, préserve les tirets. Idempotent.
 *
 * Les tirets sont *significatifs* — verify('ABCDEFGHIJ', hash('ABCD-EFGH-IJ'))
 * retourne false. Cela protège contre les frappes ambiguës.
 */
export function normalizeCode(code: string): string {
  return code.toUpperCase();
}

/**
 * Hash bcrypt cost ≥ 12 d'un code de récupération normalisé. Le clair
 * n'est jamais persisté.
 */
export async function hashCode(plaintextCode: string): Promise<BackupCodeHash> {
  const normalized = normalizeCode(plaintextCode);
  const hash = await bcrypt.hash(normalized, BCRYPT_COST);
  return hash as BackupCodeHash;
}

/**
 * Comparaison constant-time entre un code clair saisi et un hash
 * bcrypt stocké. Normalise la casse avant comparaison.
 */
export async function verifyCode(plaintextCode: string, hash: BackupCodeHash): Promise<boolean> {
  const normalized = normalizeCode(plaintextCode);
  return bcrypt.compare(normalized, hash);
}
