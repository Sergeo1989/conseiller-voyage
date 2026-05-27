// T043 — PrismaAuthUserLegalNameReader (feature 007, A1 exploration).
//
// Impl du port AuthUserLegalNameReader (T033). Lit
// AuthUser.firstName + AuthUser.lastName via @cv/db. Le nom légal vit
// dans le module identité depuis l'exploration repo (cf.
// tasks.md A1).
//
// Retourne `null` si l'utilisateur est introuvable ou si firstName/lastName
// sont NULL (cas dégénéré : utilisateur créé avant le backfill ou
// anonymisé Loi 25).

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  AuthUserLegalNameReader,
  NomLegal,
} from '../application/ports/auth-user-legal-name-reader.port';

@Injectable()
export class PrismaAuthUserLegalNameReader implements AuthUserLegalNameReader {
  async lireNomLegal(authUserId: string): Promise<NomLegal | null> {
    const row = await prisma.authUser.findUnique({
      where: { id: authUserId },
      select: { firstName: true, lastName: true },
    });
    if (!row || !row.firstName || !row.lastName) return null;
    return { prenomLegal: row.firstName, nomLegal: row.lastName };
  }
}
