// T018 — Port qui abstrait la lecture des sessions Auth.js depuis NestJS.
// Implémentation Prisma dans infrastructure/. Cf. ADR-0004 (session DB
// partagée).

export type AuthRole = 'voyageur' | 'conseiller' | 'admin';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  role: AuthRole;
  mfaVerifiedAt: Date | null;
}

export interface AuthSession {
  sessionToken: string;
  user: AuthenticatedUser;
  expiresAt: Date;
}

export interface AuthSessionReader {
  /**
   * Retourne la session correspondant au token, ou null si introuvable,
   * expirée, ou révoquée. Lecture sans effet de bord.
   */
  findValidByToken(sessionToken: string): Promise<AuthSession | null>;
}

export const AUTH_SESSION_READER = Symbol.for('AuthSessionReader');
