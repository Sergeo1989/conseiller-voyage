// T008 [017] — PrismaConseillerPublicDisplayReader (port public profil-public).
//
// Impl de ConseillerPublicDisplayReader (@cv/shared/profil-public) : lit le
// prénom (AuthUser) + les spécialités (ProfileSpeciality.labelFr) des profils
// `statut === 'pret'`, puis re-filtre la conformité `verified` (FR-008). Les
// conseillers non publics/non vérifiés sont omis (aucune fuite — OWASP A04).
//
// Surface minimale Loi 25 : prénom seul, jamais le nom complet ni de contact.

import { prisma } from '@cv/db';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import type {
  ConseillerPublicDisplay,
  ConseillerPublicDisplayReader,
} from '@cv/shared/profil-public';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class PrismaConseillerPublicDisplayReader implements ConseillerPublicDisplayReader {
  constructor(
    @Inject(CONFORMITE_QUERY_PORT)
    private readonly conformite: ConformiteQueryPort,
  ) {}

  async getPublicDisplay(
    conseillerIds: readonly string[],
  ): Promise<readonly ConseillerPublicDisplay[]> {
    if (conseillerIds.length === 0) return [];

    // 1. Profils publiables (statut='pret') + prénom + spécialités, en une requête.
    const profils = await prisma.conseillerProfile.findMany({
      where: { authUserId: { in: [...conseillerIds] }, statut: 'pret' },
      select: {
        authUserId: true,
        authUser: { select: { firstName: true } },
        specialites: {
          where: { actif: true },
          orderBy: { ordre: 'asc' },
          select: { labelFr: true },
        },
      },
    });

    // 2. Re-check conformité (verified) — un appel par ID ; le cache de la
    //    facade conformité (60s) absorbe les répétitions.
    const result: ConseillerPublicDisplay[] = [];
    for (const p of profils) {
      const conformite = await this.conformite.getVerificationStatus({
        conseillerId: p.authUserId,
        strict: false,
      });
      if (!conformite.verified) continue;
      result.push({
        conseillerId: p.authUserId,
        prenom: p.authUser?.firstName?.trim() || 'Votre conseiller',
        specialites: p.specialites.map((s) => s.labelFr),
      });
    }
    return result;
  }
}
