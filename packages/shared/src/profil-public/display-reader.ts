// T003 [017] — Port public ConseillerPublicDisplayReader.
//
// Lit le **prénom** + les **spécialités** d'affichage des conseillers, pour
// composer les notifications voyageur « vos conseillers vérifiés sont prêts »
// (feature 010, module intake). Consommé hors module via @cv/shared.
//
// **Loi 25 / anti-marketplace (ADR-0002)** : surface volontairement minimale —
// jamais de nom complet, courriel, téléphone ni coordonnée de contact. Seuls le
// prénom et les libellés de spécialité (données déjà publiques) sont exposés.
//
// **Filtre de sécurité** : ne retourne QUE les conseillers publics + vérifiés
// (re-check `statut === 'pret'` × conformité `verified`). Les IDs non publics
// sont silencieusement omis (aucune fuite de la raison — OWASP A04).

export interface ConseillerPublicDisplay {
  readonly conseillerId: string;
  /** Prénom seul (jamais le nom complet — Loi 25 minimisation). */
  readonly prenom: string;
  /** Libellés FR-CA des spécialités, triés par `ordre`. Peut être vide. */
  readonly specialites: readonly string[];
}

export interface ConseillerPublicDisplayReader {
  /**
   * Retourne l'affichage public (prénom + spécialités) des conseillers donnés.
   * Filtre aux seuls conseillers publics + vérifiés ; omet les autres. L'ordre
   * de sortie n'est pas garanti — le consommateur indexe par `conseillerId`.
   */
  getPublicDisplay(conseillerIds: readonly string[]): Promise<readonly ConseillerPublicDisplay[]>;
}

export const CONSEILLER_PUBLIC_DISPLAY_READER = Symbol.for('ConseillerPublicDisplayReader');
