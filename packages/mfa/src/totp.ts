// TOTP RFC 6238 — wrapper otplib.
// Cf. ADR-0011 (choix otplib) et
// specs/005-mfa-conseiller/contracts/totp-validator.port.md.

import { authenticator } from 'otplib';

// Configuration fixe pour toute la feature 005 — appliquée au module
// import (otplib a un état global). Ne PAS réassigner ailleurs.
// `algorithm` est laissé au défaut otplib ('sha1') qui correspond à la
// RFC 6238 default. Le type HashAlgorithms d'otplib n'expose pas 'sha1'
// en string littéral (énumération côté types), donc on omet le champ
// pour conserver le défaut.
authenticator.options = {
  step: 30, // RFC 6238 standard, compatible toutes les apps TOTP
  window: 1, // tolérance ±1 pas = ±30 s (FR-009)
  digits: 6, // 6 chiffres (FR-002)
};

const ISSUER = 'Conseiller Voyage';

/**
 * Vérifie qu'un code TOTP à 6 chiffres correspond au secret Base32, dans
 * la fenêtre de tolérance ±1 pas (±30 s).
 *
 * @param secret Secret Base32 en clair (déjà déchiffré par le caller).
 * @param code   Code à 6 chiffres saisi par l'utilisateur.
 * @returns true si valide, false sinon. Pas de throw — l'invalidité est
 *          un cas normal du flow.
 *
 * Constant-time interne (otplib utilise crypto.timingSafeEqual).
 */
export function verify(secret: string, code: string): boolean {
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    // otplib throw sur secret mal formé. On traite comme code invalide.
    return false;
  }
}

/**
 * Génère un nouveau secret TOTP de 160 bits encodé Base32 (RFC 4648
 * alphabet `A-Z2-7`, 32 caractères sans padding).
 */
export function generateSecret(): string {
  return authenticator.generateSecret(20); // 20 bytes = 160 bits → 32 chars Base32
}

/**
 * Construit l'URL `otpauth://totp/...` standard pour l'enrôlement dans
 * une app TOTP. Utilisée par l'écran d'enrôlement pour générer le QR
 * code (R4).
 *
 * @param accountLabel Étiquette affichée dans l'app TOTP (typiquement
 *                     le courriel de l'utilisateur).
 * @param secret       Secret Base32 en clair.
 */
export function buildKeyUri(accountLabel: string, secret: string): string {
  return authenticator.keyuri(accountLabel, ISSUER, secret);
}
