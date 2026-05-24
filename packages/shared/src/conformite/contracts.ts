// US3 — Contrat ConformiteQueryPort exposé aux autres modules.
//
// Les modules consommateurs (matching, SEO, intake) DOIVENT importer
// uniquement ce contrat — jamais les types internes du module
// conformité. Le check-module-boundaries.ts (T030a) le vérifie.
//
// Le contract test T098 (apps/api/test/contract/) garantit que la
// facade ConformiteQueryFacade respecte ce contrat.

export interface VerificationStatusDto {
  readonly conseillerId: string;
  readonly verified: boolean;
  readonly lastVerifiedAt: string | null;
}

export interface ConformiteQueryPort {
  /**
   * Lit le statut de vérification du conseiller (cache 60s).
   * Retourne verified=false si conseiller inconnu, suspendu, révoqué,
   * ou anonymisé Loi 25 (filtre matériel FR-007 / U1).
   */
  getVerificationStatus(args: {
    readonly conseillerId: string;
    /** Bypass cache pour décisions critiques (matching final, paiement). */
    readonly strict?: boolean;
  }): Promise<VerificationStatusDto>;

  /**
   * Abonnement aux événements status.changed (cache invalidation,
   * réindexation SEO, etc.).
   */
  onStatusChanged(
    handler: (event: {
      readonly conseillerId: string;
      readonly previousStatus: string;
      readonly newStatus: string;
      readonly transitionKind: 'positive' | 'negative';
      readonly cause: string;
    }) => void,
  ): () => void;
}
