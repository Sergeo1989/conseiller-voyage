// Port ActiveSessionRevoker — invalidation des sessions Auth.js v5.
// Cf. specs/005-mfa-conseiller/research.md R7 + FR-024a + FR-015b.
//
// Pattern : DELETE FROM auth_sessions WHERE userId = ? — la session
// supprimée renvoie 401 à la prochaine requête authentifiée
// (PrismaAuthSessionReader retourne null).
//
// P0-3 (review) : la méthode doit AUSSI supprimer les buckets de rate
// limit `mfa_rate_limit_buckets` orphelins dont `sessionId` pointait
// sur une session supprimée.

export interface ActiveSessionRevoker {
  /**
   * Supprime toutes les sessions actives du user + les buckets stepup
   * orphelins associés. Utilisé par le reset MFA admin (FR-024a).
   *
   * @returns nombre de sessions supprimées
   */
  revokeAll(userId: string): Promise<number>;

  /**
   * Supprime toutes les sessions sauf celle dont le token est fourni.
   * Utilisé par le device change self-service (FR-015b) — la session
   * courante reste valide pour permettre à l'utilisateur de finaliser
   * l'enrôlement du nouveau secret.
   *
   * @returns nombre de sessions supprimées
   */
  revokeAllExcept(userId: string, exceptSessionToken: string): Promise<number>;
}

export const ACTIVE_SESSION_REVOKER = Symbol.for('ActiveSessionRevoker');
