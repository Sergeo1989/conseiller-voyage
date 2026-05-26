// T021 — normalizeEmail (R9 / H8).
//
// Fonction pure. Aucun I/O. Idempotente.
//
// Applique :
//   - trim() : élimine les espaces accidentels (collage maladroit)
//   - toLowerCase() : RFC 5321 local-part case-insensible en pratique
//   - normalize('NFC') : forme composée standard, évite NFC ≠ NFD côté lookup
//
// NE strip PAS les `+aliases` — préserve l'intention utilisateur (e.g.,
// `maxime+spam@test.local`).

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFC');
}
