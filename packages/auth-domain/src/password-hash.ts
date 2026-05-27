// T026 — prehashAndHash + verifyPrehashed (C2 / R3).
//
// Algorithme : bcrypt(base64(sha256(plaintext)), cost=11).
//
// Le pré-hash SHA-256 :
//   - Produit toujours 32 octets bruts (44 chars base64), bien sous la
//     limite 72-octets de bcrypt.
//   - Neutralise la troncature silencieuse de bcrypt sur les mots de
//     passe longs ou riches en multi-octets UTF-8 (emojis).
//
// Le cost 11 :
//   - Compromis avec bcryptjs JS pur sur Fargate t4g ARM (~400 ms p95).
//   - Cf. research.md R3 et tasks.md T124 (benchmark CI obligatoire).

import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 11;

/**
 * SHA-256 du plaintext, encodé base64 — produit toujours 44 chars
 * (32 octets bruts), bien sous la limite 72 de bcrypt.
 */
export function prehash(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('base64');
}

/**
 * Hash bcrypt cost 11 d'un mot de passe pré-hashé SHA-256.
 * Retourne un hash bcrypt standard (`$2a$11$...` ou `$2b$11$...`).
 */
export async function prehashAndHash(plaintext: string): Promise<string> {
  return bcrypt.hash(prehash(plaintext), BCRYPT_COST);
}

/**
 * Vérifie un mot de passe contre un hash bcrypt précédemment produit
 * par `prehashAndHash`. Retourne `false` si le hash est null, malformé,
 * ou si le mot de passe ne correspond pas.
 */
export async function verifyPrehashed(plaintext: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(prehash(plaintext), hash);
  } catch {
    return false;
  }
}

/**
 * Hash bcrypt sentinelle utilisé pour le chronométrage constant côté
 * login lors d'un email inexistant (R5 anti-énumération). Pré-calculé
 * au boot pour éviter de payer le coût bcrypt à chaque invocation.
 *
 * Valeur produite par : prehashAndHash('not-a-real-password-sentinel-2026').
 * Le plaintext exact n'a aucune importance — ce hash ne sera jamais matché.
 */
export const DUMMY_HASH = '$2a$11$qvw9O5j78frQGc2jo7TOBu3VXvl.OcR9O6DflP52RBPCg0PvZWz7.';
