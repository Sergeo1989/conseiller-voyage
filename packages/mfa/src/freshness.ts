// Calcul de la fenêtre "MFA frais" (FR-016).
//
// Une session est considérée comme MFA-frais pendant 30 min après la
// dernière validation TOTP (initial ou step-up). Au-delà, un step-up
// est requis avant toute action sensible (FR-017, FR-018).
//
// Pur — pas d'I/O. Testable indépendamment du système d'horloge via
// l'injection de `now`.

export const DEFAULT_FRESHNESS_WINDOW_MIN = 30;

/**
 * Détermine si une session est encore "MFA frais".
 *
 * @param mfaVerifiedAt Timestamp de la dernière validation TOTP, ou
 *                      null si jamais vérifié dans cette session.
 * @param now           Horloge courante (injectable pour tests).
 * @param windowMin     Largeur de la fenêtre en minutes (défaut 30,
 *                      cf. FR-016).
 * @returns true si MFA-frais, false sinon.
 *
 * Sémantique de la limite : strictement < windowMin minutes écoulées
 * = fresh ; >= windowMin = non fresh (limite inclusive, P2-6).
 *
 * Cas particuliers :
 * - `mfaVerifiedAt = null` → false (jamais vérifié)
 * - `mfaVerifiedAt > now` (drift d'horloge mineur) → true (on accorde
 *   le bénéfice du doute, sinon une horloge serveur en retard
 *   invaliderait les sessions légitimes)
 */
export function isFresh(
  mfaVerifiedAt: Date | null,
  now: Date,
  windowMin: number = DEFAULT_FRESHNESS_WINDOW_MIN,
): boolean {
  if (mfaVerifiedAt === null) return false;

  const ageMs = now.getTime() - mfaVerifiedAt.getTime();
  if (ageMs < 0) return true; // drift d'horloge — accorder le bénéfice du doute

  const windowMs = windowMin * 60 * 1000;
  return ageMs < windowMs; // limite stricte : >= windowMs = non fresh
}
