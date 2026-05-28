// ListerProfilsAdminUseCase (feature 007 US6, console admin).
//
// Liste paginée des profils conseiller pour la console admin, avec filtre
// optionnel par statut. Pagination cursor-less (page/pageSize). Pas
// d'auth check ici — fait par RoleGuard('admin') côté controller.

import { prisma } from '@cv/db';
import type { StatutProfil } from '@cv/profil-domain';
import { Injectable } from '@nestjs/common';

export interface ListerProfilsAdminInput {
  readonly statut?: StatutProfil;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ProfilAdminListItem {
  readonly profilId: string;
  readonly authUserId: string;
  readonly slug: string | null;
  readonly statut: StatutProfil;
  readonly nomLegal: string;
  readonly publishedAt: string | null;
  readonly updatedAt: string;
}

export interface ListerProfilsAdminResult {
  readonly items: readonly ProfilAdminListItem[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ListerProfilsAdminUseCase {
  async execute(input: ListerProfilsAdminInput): Promise<ListerProfilsAdminResult> {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, input.pageSize ?? DEFAULT_PAGE_SIZE));
    const skip = (page - 1) * pageSize;

    const where = input.statut ? { statut: input.statut } : {};

    const [rows, totalCount] = await Promise.all([
      prisma.conseillerProfile.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          authUserId: true,
          slug: true,
          statut: true,
          publishedAt: true,
          updatedAt: true,
          authUser: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.conseillerProfile.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        profilId: r.id,
        authUserId: r.authUserId,
        slug: r.slug,
        statut: r.statut,
        nomLegal:
          `${r.authUser?.firstName ?? ''} ${r.authUser?.lastName ?? ''}`.trim() || '[sans nom]',
        publishedAt: r.publishedAt?.toISOString() ?? null,
        updatedAt: r.updatedAt.toISOString(),
      })),
      totalCount,
      page,
      pageSize,
    };
  }
}
