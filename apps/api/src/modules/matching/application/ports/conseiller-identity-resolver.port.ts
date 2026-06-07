// T041 [US2] — Port ConseillerIdentityResolver.
//
// Les leads référencent le `conseillerId` = ConseillerProfile.id (id métier
// matching). La session HTTP fournit l'AuthUser.id. Ce port résout l'un vers
// l'autre pour l'autorisation propriétaire des endpoints conseiller.

export interface ConseillerIdentityResolver {
  /** Profile id (= conseillerId matching) pour un AuthUser, ou null si absent. */
  resolveProfileIdByAuthUserId(authUserId: string): Promise<string | null>;
}

export const CONSEILLER_IDENTITY_RESOLVER = Symbol.for('ConseillerIdentityResolver');
