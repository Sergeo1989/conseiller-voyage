// StubPasswordVerifier — implémentation MVP 005 du PasswordVerifierPort.
//
// Retourne `true` pour tout mot de passe non-vide. Cette stub permet à
// US6 (auto-service device change) de fonctionner pendant que la
// feature 002 (auth conseiller + admin avec mot de passe) n'a pas
// livré son infrastructure de hash mot de passe.
//
// GARDE PRODUCTION (bug_007 ultraréview) : le constructeur THROW si
// NODE_ENV === 'production'. Sans cette garde, déployer 005 avant 002
// rend le password gate de US6 entièrement no-op (accepte tout > 0
// caractère, et la validation Zod côté DTO accepte tout ≥ 8 chars).
// Mirror du pattern KEK-zeros refusée en prod (env.ts:64-81).
//
// QUAND 002 ARRIVE : remplacer par PrismaPasswordVerifier qui :
//   - SELECT auth_accounts WHERE userId = ? AND provider = 'credentials'
//   - bcrypt.compare(plaintext, account.password_hash)
//   - return result OR false (si pas d'account credentials)

import { Injectable, Logger } from '@nestjs/common';
import type { PasswordVerifier } from '../application/ports/password-verifier.port';

@Injectable()
export class StubPasswordVerifier implements PasswordVerifier {
  private readonly logger = new Logger(StubPasswordVerifier.name);
  private warned = false;

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'StubPasswordVerifier must not run in production. ' +
          'Branche PrismaPasswordVerifier (feature 002) avant déploiement.',
      );
    }
  }

  async verify(_userId: string, plaintextPassword: string): Promise<boolean> {
    if (!this.warned) {
      this.logger.warn(
        'StubPasswordVerifier active — TOUS les mots de passe sont acceptés. ' +
          'Branche PrismaPasswordVerifier dès que la feature 002 livre.',
      );
      this.warned = true;
    }
    return Promise.resolve(plaintextPassword.length > 0);
  }
}
