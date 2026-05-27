// T025 — Hash HMAC-SHA-256 peppered d'une adresse email canonicalisée.
//
// Fix B-1 review adversariale 002 : SHA-256 nu est rainbow-tabable, la
// CAI considère ça comme PII identifiable. HMAC peppered avec un secret
// 256 bits non-divulgué empêche le reverse même en cas de fuite DB.
//
// Cf. research.md R6 (rotation manuelle, peppers historiques conservés
// indéfiniment pour permettre le match de vieilles suppression list
// entries après rotation).
//
// Fonction pure — pas d'I/O, déterministe pour une paire (email, pepper).

import { createHmac } from 'node:crypto';

/**
 * Calcule le hash HMAC-SHA-256 d'une adresse email pré-canonicalisée
 * avec le pepper donné. Retourne un hex lowercase de 64 caractères.
 *
 * IMPORTANT : l'email DOIT être passé déjà canonicalisé (via
 * `canonicalizeEmail`). Hasher un email non canonicalisé produit un hash
 * différent selon les variantes Gmail.
 *
 * @param canonicalEmail forme canonique (lowercase, no Gmail aliases)
 * @param pepper base64 du secret 256 bits stocké en Secrets Manager
 */
export function hashRecipientEmail(canonicalEmail: string, pepper: string): string {
  if (canonicalEmail.length === 0) {
    throw new Error('Cannot hash empty email');
  }
  if (pepper.length === 0) {
    throw new Error('Cannot hash with empty pepper');
  }
  return createHmac('sha256', pepper).update(canonicalEmail).digest('hex');
}

/**
 * Vérifie si un email canonicalisé correspond à un hash donné, en
 * essayant le pepper courant puis chaque pepper historique. Utile en
 * cas de rotation où la suppression list contient des hash sur l'ancien
 * pepper.
 *
 * @param canonicalEmail forme canonique
 * @param expectedHash hash à matcher
 * @param peppers liste de peppers à essayer dans l'ordre (current first)
 * @returns true si un des peppers produit `expectedHash`
 */
export function matchRecipientEmailHash(
  canonicalEmail: string,
  expectedHash: string,
  peppers: readonly string[],
): boolean {
  for (const pepper of peppers) {
    if (hashRecipientEmail(canonicalEmail, pepper) === expectedHash) {
      return true;
    }
  }
  return false;
}
