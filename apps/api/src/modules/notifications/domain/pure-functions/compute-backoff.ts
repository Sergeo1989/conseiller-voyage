// T026 — Calcul du prochain `nextAttemptAt` selon le nombre d'attempts
// déjà effectués. Backoff exponentiel borné à 5 tentatives, conforme à
// la politique constitution Principe X (retry exponentiel max 5).
//
// Delays prescrits (en secondes) :
//   attempt 1 → +1 min   (60 s)
//   attempt 2 → +5 min   (300 s)
//   attempt 3 → +30 min  (1800 s)
//   attempt 4 → +4 h     (14400 s)
//   attempt 5 → +24 h    (86400 s)
//   attempt 6+ → MAX_ATTEMPTS atteint, dead-letter
//
// Fonction pure : prend le nombre d'attempts déjà effectués + l'instant
// courant, retourne le timestamp du prochain essai. Clock injectée.

const BACKOFF_DELAYS_SECONDS: readonly number[] = [60, 300, 1800, 14400, 86400];
export const MAX_ATTEMPTS = BACKOFF_DELAYS_SECONDS.length;

/**
 * Calcule le timestamp du prochain essai selon le numéro d'attempt qui
 * VIENT d'échouer. `attemptsSoFar` est le compteur après incrément :
 * si on a fait 1 tentative et qu'elle a échoué, on passe 1 et on
 * retourne now + 60s.
 *
 * @throws si attemptsSoFar > MAX_ATTEMPTS — l'appelant doit gérer le
 *         passage en dead-letter avant d'appeler.
 */
export function computeBackoff(attemptsSoFar: number, now: Date): Date {
  if (attemptsSoFar < 1) {
    throw new Error(`computeBackoff: attemptsSoFar must be >= 1, got ${attemptsSoFar}`);
  }
  if (attemptsSoFar > MAX_ATTEMPTS) {
    throw new Error(
      `computeBackoff: MAX_ATTEMPTS=${MAX_ATTEMPTS} exceeded (got ${attemptsSoFar}). Move to dead-letter instead.`,
    );
  }
  const delaySec = BACKOFF_DELAYS_SECONDS[attemptsSoFar - 1] as number;
  return new Date(now.getTime() + delaySec * 1000);
}

export function shouldMoveToDeadLetter(attemptsSoFar: number): boolean {
  return attemptsSoFar >= MAX_ATTEMPTS;
}
