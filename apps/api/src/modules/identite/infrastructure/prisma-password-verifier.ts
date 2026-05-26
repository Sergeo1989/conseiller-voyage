// T064 — PrismaPasswordVerifier (feature 002 / US2 + remplace stub US6).
//
// Vraie implémentation du port `PasswordVerifier` défini par 002a.
// Drop-in replacement du `StubPasswordVerifier` qui était utilisé en MVP
// pour permettre à US6 (auto-service device change) de fonctionner.
//
// Algorithme (R3 / C2) :
//   - SELECT auth_accounts WHERE userId = ? AND provider = 'credentials'
//   - bcrypt.compare(base64(sha256(plaintext)), password_hash)
//   - Retourne false si aucun row ou hash null (utilisateur magic-link
//     uniquement, p. ex. voyageur — pas de password disponible).

import { verifyPrehashed } from '@cv/auth-domain';
import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type { PasswordVerifier } from '../application/ports/password-verifier.port';

@Injectable()
export class PrismaPasswordVerifier implements PasswordVerifier {
  async verify(userId: string, plaintextPassword: string): Promise<boolean> {
    if (plaintextPassword.length === 0) return false;
    const account = await prisma.authAccount.findFirst({
      where: { userId, provider: 'credentials' },
      select: { password_hash: true },
    });
    return verifyPrehashed(plaintextPassword, account?.password_hash ?? null);
  }
}
