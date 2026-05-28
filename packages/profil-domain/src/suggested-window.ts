// T021 — Fenêtre de validité 24h du paramètre `suggested` (FR-008a).
//
// Le cookie `cv_suggested` (HMAC) stocke des entrées
// `{conseillerId, timestamp}`. Chaque entrée a une fenêtre de 24h max
// — au-delà, ignorée à la soumission de l'intake (feature 008 future).
//
// Le drift d'horloge négatif (timestamp dans le futur) est traité comme
// invalide pour bloquer les forgeries.

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Détermine si un timestamp de consultation est encore dans la fenêtre 24h.
 *
 * @param timestampConsultationMs - Date d'ouverture de la page profil par le voyageur (Unix ms).
 * @param nowMs - Heure actuelle (Unix ms), injectée pour testabilité.
 * @returns true si `0 < now - ts < 24h`, false sinon.
 *
 * Fonction pure.
 */
export function fenetreValiditeSuggested(timestampConsultationMs: number, nowMs: number): boolean {
  const ageMs = nowMs - timestampConsultationMs;
  if (ageMs <= 0) return false; // drift horloge / forgery
  if (ageMs >= TWENTY_FOUR_HOURS_MS) return false; // au-delà de la fenêtre
  return true;
}
