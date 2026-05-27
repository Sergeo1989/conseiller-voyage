// T033 — Port lecture du nom légal vérifié (feature 007 / A1 exploration).
//
// **Renommé suite exploration repo** (specs/007-profil-conseiller/tasks.md A1) :
// le nom légal vit dans `AuthUser.firstName + AuthUser.lastName` (et non
// dans le dossier conformité comme initialement prévu). Le port lit
// directement la table auth_users via Prisma.
//
// Consommé par :
//   - EditerProfilUseCase : pour calculer le slug `prenom-nom`
//   - LirePageProfilPubliqueUseCase + LireProfilPriveUseCase : pour formater
//     `nomAffiche` via formaterNomAffiche du domaine pur.

export interface NomLegal {
  readonly prenomLegal: string;
  readonly nomLegal: string;
}

export interface AuthUserLegalNameReader {
  /**
   * Lit le nom légal d'un AuthUser. Retourne `null` si :
   *   - utilisateur inexistant
   *   - firstName OU lastName NULL (cas dégénéré, n'arrive normalement
   *     pas pour un conseiller post-signup ; le backfill traite les
   *     utilisateurs créés avant feature 007).
   */
  lireNomLegal(authUserId: string): Promise<NomLegal | null>;
}

export const AUTH_USER_LEGAL_NAME_READER = Symbol.for('AuthUserLegalNameReader');
