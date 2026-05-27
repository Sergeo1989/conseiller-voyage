// T045 — PrismaEstProfilPublic (feature 007, port public).
//
// Impl de l'interface EstProfilPublicPort (@cv/shared/profil-public).
// AND de deux booléens :
//   1. statut profil === 'pret' (lu via Prisma)
//   2. conformité verified (lu via ConformiteQueryPort)
//
// Aucune fuite d'information (Insecure Design OWASP A04) — retourne
// uniquement `boolean`, jamais la raison d'exclusion.

import { prisma } from '@cv/db';
import type { ConformiteQueryPort } from '@cv/shared/conformite';
import type { EstProfilPublicPort } from '@cv/shared/profil-public';
import { Inject, Injectable } from '@nestjs/common';
import { CONFORMITE_QUERY_PORT } from './prisma-profil-public-reader';

@Injectable()
export class PrismaEstProfilPublic implements EstProfilPublicPort {
  constructor(
    @Inject(CONFORMITE_QUERY_PORT)
    private readonly conformite: ConformiteQueryPort,
  ) {}

  async estPublic(conseillerId: string): Promise<boolean> {
    if (!conseillerId) return false;
    const profil = await prisma.conseillerProfile.findUnique({
      where: { authUserId: conseillerId },
      select: { statut: true },
    });
    if (!profil || profil.statut !== 'pret') return false;
    const conformite = await this.conformite.getVerificationStatus({
      conseillerId,
      strict: false,
    });
    return conformite.verified;
  }

  async filtrerPublics(conseillerIds: readonly string[]): Promise<readonly string[]> {
    if (conseillerIds.length === 0) return [];

    // 1. Filtre côté DB : seulement les profils statut='pret'.
    const profils = await prisma.conseillerProfile.findMany({
      where: { authUserId: { in: [...conseillerIds] }, statut: 'pret' },
      select: { authUserId: true },
    });
    const profilsReady = new Set(profils.map((p) => p.authUserId));

    // 2. Filtre conformité : un appel par ID (le port n'a pas de batch ;
    //    si volumétrie le justifie un jour, batch côté facade). Cache
    //    interne ConformiteQueryFacade (60s) absorbe les répétitions.
    const result: string[] = [];
    for (const id of conseillerIds) {
      if (!profilsReady.has(id)) continue;
      const conformite = await this.conformite.getVerificationStatus({
        conseillerId: id,
        strict: false,
      });
      if (conformite.verified) result.push(id);
    }
    return result;
  }
}
