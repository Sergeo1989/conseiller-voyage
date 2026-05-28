// T015 — Détection de format image via magic number (12 premiers octets).
//
// Anti-spoofing strict (Principe IX, R3 + C3) : on ne fait pas confiance au
// content-type HTTP déclaré. La détection se fait sur les bytes réels.
//
// Pourquoi 12 octets et pas 4 ? WebP commence par RIFF (4 octets) mais
// WAV et AVI aussi. Pour distinguer, il FAUT lire l'offset 8-11 qui
// contient 'WEBP' / 'WAVE' / 'AVI '. Voir research.md C3 (correction
// post-revue).

export type FormatImage = 'jpeg' | 'png' | 'webp';

/**
 * Détecte le format réel d'une image à partir des 12 premiers octets.
 *
 * @returns Le format détecté, ou `null` si non reconnu / buffer trop court.
 *
 * Fonction pure : entrées identiques → sortie identique. Pas d'I/O.
 */
export function detecterFormatImage(buffer: Buffer): FormatImage | null {
  if (buffer.length < 12) return null;

  // JPEG : FF D8 FF (suffit, le 4e octet flag JFIF/EXIF/SPIFF varie)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // PNG : 89 50 4E 47 0D 0A 1A 0A (signature complète, 8 octets stricts)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // WebP : RIFF (octets 0-3) ET WEBP (octets 8-11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }

  return null;
}
