// Port MfaRateLimiter — compteur de tentatives MFA.
// Cf. specs/005-mfa-conseiller/research.md R3 + data-model.md
// § Concurrence n°1.
//
// Implémentation : infrastructure/postgres-mfa-rate-limiter.ts utilise un
// INSERT ... ON CONFLICT DO UPDATE atomique pour éviter la race condition
// (P0-2 du review).

export type MfaRateLimitKind = 'login_totp' | 'stepup_totp' | 'enroll_start' | 'device_change';

export interface RateLimitResult {
  readonly attempts: number;
  readonly lockedUntil: Date | null;
}

export interface MfaRateLimiter {
  /**
   * Incrémente atomiquement le compteur de tentatives pour la clé
   * (userId, kind, sessionId?). Si le seuil est atteint (5 pour
   * login_totp, 3 pour stepup_totp, etc. — politique encapsulée par
   * l'implémentation), pose `lockedUntil` selon la durée configurée.
   *
   * @param sessionId obligatoire pour stepup_totp, null pour les autres
   *                  (P0-3 scoping).
   */
  recordAttempt(
    userId: string,
    kind: MfaRateLimitKind,
    sessionId: string | null,
  ): Promise<RateLimitResult>;

  /**
   * Vérifie si la clé est actuellement verrouillée (lockedUntil > NOW).
   * Lecture sans effet de bord.
   */
  isLocked(
    userId: string,
    kind: MfaRateLimitKind,
    sessionId: string | null,
  ): Promise<{ locked: boolean; unlockAt: Date | null }>;

  /**
   * Réinitialise le compteur (utilisé après une vérification TOTP
   * réussie — pas de pénalité prolongée pour un user qui reprend la
   * main).
   */
  reset(userId: string, kind: MfaRateLimitKind, sessionId: string | null): Promise<void>;
}

export const MFA_RATE_LIMITER = Symbol.for('MfaRateLimiter');
