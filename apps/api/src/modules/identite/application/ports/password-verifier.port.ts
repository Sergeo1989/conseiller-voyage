// PasswordVerifierPort — vérifie un mot de passe contre le hash stocké
// par Auth.js (feature 002, à venir).
//
// MVP 005 : implémentation stub qui retourne true. Sera remplacée par
// l'impl Prisma qui interroge `auth_accounts` (ou la table dédiée
// password de 002) quand cette feature livrera.
//
// Cette abstraction permet à US6 d'être correct conceptuellement et
// d'être juste rebranché quand 002 arrive.

export interface PasswordVerifier {
  /**
   * Vérifie qu'un mot de passe clair correspond au hash stocké pour
   * cet utilisateur. Retourne false si le user n'a pas de mot de
   * passe (utilisateurs magic-link uniquement, p. ex. voyageurs).
   */
  verify(userId: string, plaintextPassword: string): Promise<boolean>;
}

export const PASSWORD_VERIFIER = Symbol.for('PasswordVerifier');
