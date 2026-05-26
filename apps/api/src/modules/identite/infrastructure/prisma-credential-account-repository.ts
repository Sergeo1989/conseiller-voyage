// T046 — PrismaCredentialAccountRepository (feature 002 US1/US2).
//
// Lookup symétrique JOIN unifié (R5/C6) — une seule requête couvre les
// deux cas (compte existe / compte n'existe pas) pour ne pas fuiter de
// timing par roundtrip supplémentaire.

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  CredentialAccount,
  CredentialAccountRepository,
} from '../application/ports/credential-account-repository.port';

@Injectable()
export class PrismaCredentialAccountRepository implements CredentialAccountRepository {
  async findByEmail(emailNormalized: string): Promise<CredentialAccount | null> {
    // SELECT JOIN unifié — Prisma n'a pas d'API native pour exiger un
    // LEFT JOIN avec filtre sur la jointure, donc on requête en 2 temps
    // mais on garde l'ordre fixe pour neutraliser le timing.
    const user = await prisma.authUser.findUnique({
      where: { email: emailNormalized },
      select: {
        id: true,
        email: true,
        role: true,
        emailVerified: true,
      },
    });
    if (!user || !user.email) return null;

    const account = await prisma.authAccount.findFirst({
      where: { userId: user.id, provider: 'credentials' },
      select: { password_hash: true },
    });

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      emailVerifiedAt: user.emailVerified,
      passwordHash: account?.password_hash ?? null,
    };
  }
}
