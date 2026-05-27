// T029 — Priority lane BullMQ pour les courriels transactionnels.
//
// Fix I-11 review architecte : sous pic d'expiration certificat
// (batch de 200 envois rappels J-30), le voyageur qui s'inscrit ne
// doit pas attendre la fin du batch. BullMQ `priority: 1` est traité
// avant `priority: 10` par le worker.
//
// Cf. research.md R16 (BullMQ priority lanes).
//
// Fonction pure : prend un eventType (string libre côté conformité,
// ou prefixed côté auth/mfa) et retourne 1 ou 10.

/**
 * Priorité critique : magic-link, reset password, MFA step-up — l'usager
 * attend le mail en cours d'action. Latence visible directement.
 */
const CRITICAL_PRIORITY = 1;

/**
 * Priorité batch : rappels expiration, accusés de soumission — pas de
 * voyageur en attente direct.
 */
const BATCH_PRIORITY = 10;

const CRITICAL_EVENT_PREFIXES: ReadonlyArray<string> = [
  // auth
  'auth.email_verification',
  'auth.password_reset',
  'auth.admin_invitation',
  // MFA — étapes interactives
  'mfa.totp_activated',
  'mfa.stepup_session_killed',
  'mfa.login_locked',
  'mfa.device_change_incomplete',
  'mfa.device_changed',
  'mfa.admin_reset',
];

/**
 * Détermine la priorité BullMQ pour un eventType.
 * Conservative default : tout ce qui n'est pas explicitement critique
 * passe en BATCH (n'enverra pas plus tard, juste après les critiques
 * en file).
 */
export function priorityForEventType(eventType: string): number {
  for (const prefix of CRITICAL_EVENT_PREFIXES) {
    if (eventType === prefix || eventType.startsWith(`${prefix}.`)) {
      return CRITICAL_PRIORITY;
    }
  }
  return BATCH_PRIORITY;
}

export const PRIORITY_CRITICAL = CRITICAL_PRIORITY;
export const PRIORITY_BATCH = BATCH_PRIORITY;
