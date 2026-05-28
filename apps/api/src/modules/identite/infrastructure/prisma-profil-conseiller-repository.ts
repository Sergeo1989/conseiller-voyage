// T036 — PrismaProfilConseillerRepository (feature 007).
//
// Impl du port ProfilConseillerRepository (T026). Toutes les méthodes
// supportent une transaction Prisma optionnelle (saga upload photo,
// publication initiale, anonymisation Loi 25).

import { type Prisma, prisma } from '@cv/db';
import type { StatutProfil } from '@cv/profil-domain';
import { Injectable } from '@nestjs/common';
import type {
  ConseillerProfileSnapshot,
  CreerProfilInput,
  ProfilConseillerRepository,
  PublishProfilInput,
  UpdatePhotoInput,
  UpdateProfilInput,
  UpdateStatutInput,
} from '../application/ports/profil-conseiller-repository.port';

type Db = Prisma.TransactionClient | typeof prisma;

const profilSelect = {
  id: true,
  authUserId: true,
  titre: true,
  biographie: true,
  anneesExperience: true,
  afficherNomComplet: true,
  photoS3Key: true,
  photoWidth: true,
  photoHeight: true,
  photoContentType: true,
  slug: true,
  statut: true,
  raisonMasquageAdmin: true,
  publishedAt: true,
  anonymizedAt: true,
  createdAt: true,
  updatedAt: true,
  specialites: { select: { code: true } },
  langues: { select: { code: true } },
  zonesGeographiques: { select: { code: true } },
} as const;

type ProfilRow = {
  id: string;
  authUserId: string;
  titre: string | null;
  biographie: string | null;
  anneesExperience: number | null;
  afficherNomComplet: boolean;
  photoS3Key: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
  photoContentType: string | null;
  slug: string | null;
  statut: StatutProfil;
  raisonMasquageAdmin: string | null;
  publishedAt: Date | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  specialites: readonly { code: string }[];
  langues: readonly { code: string }[];
  zonesGeographiques: readonly { code: string }[];
};

function toSnapshot(row: ProfilRow): ConseillerProfileSnapshot {
  return {
    id: row.id,
    authUserId: row.authUserId,
    titre: row.titre,
    biographie: row.biographie,
    anneesExperience: row.anneesExperience,
    afficherNomComplet: row.afficherNomComplet,
    photoS3Key: row.photoS3Key,
    photoWidth: row.photoWidth,
    photoHeight: row.photoHeight,
    photoContentType: row.photoContentType,
    slug: row.slug,
    statut: row.statut,
    raisonMasquageAdmin: row.raisonMasquageAdmin,
    publishedAt: row.publishedAt,
    anonymizedAt: row.anonymizedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    specialitesCodes: row.specialites.map((s) => s.code),
    languesCodes: row.langues.map((l) => l.code),
    zonesGeographiquesCodes: row.zonesGeographiques.map((z) => z.code),
  };
}

@Injectable()
export class PrismaProfilConseillerRepository implements ProfilConseillerRepository {
  private db(tx?: Prisma.TransactionClient): Db {
    return tx ?? prisma;
  }

  async findById(id: string): Promise<ConseillerProfileSnapshot | null> {
    const row = await prisma.conseillerProfile.findUnique({
      where: { id },
      select: profilSelect,
    });
    return row ? toSnapshot(row) : null;
  }

  async findByAuthUserId(authUserId: string): Promise<ConseillerProfileSnapshot | null> {
    const row = await prisma.conseillerProfile.findUnique({
      where: { authUserId },
      select: profilSelect,
    });
    return row ? toSnapshot(row) : null;
  }

  async findBySlug(slug: string): Promise<ConseillerProfileSnapshot | null> {
    const row = await prisma.conseillerProfile.findUnique({
      where: { slug },
      select: profilSelect,
    });
    return row ? toSnapshot(row) : null;
  }

  async listSlugsPubliables(): Promise<readonly string[]> {
    const rows = await prisma.conseillerProfile.findMany({
      where: { statut: 'pret', slug: { not: null } },
      select: { slug: true },
    });
    return rows.map((r) => r.slug ?? '').filter((s) => s.length > 0);
  }

  async create(
    input: CreerProfilInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ConseillerProfileSnapshot> {
    const row = await this.db(tx).conseillerProfile.create({
      data: { authUserId: input.authUserId, ...(input.id && { id: input.id }) },
      select: profilSelect,
    });
    return toSnapshot(row);
  }

  async update(
    input: UpdateProfilInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ConseillerProfileSnapshot> {
    const { id, specialitesCodes, languesCodes, zonesGeographiquesCodes, ...scalars } = input;
    const row = await this.db(tx).conseillerProfile.update({
      where: { id },
      data: {
        ...scalars,
        ...(specialitesCodes && {
          specialites: { set: specialitesCodes.map((code) => ({ code })) },
        }),
        ...(languesCodes && { langues: { set: languesCodes.map((code) => ({ code })) } }),
        ...(zonesGeographiquesCodes && {
          zonesGeographiques: { set: zonesGeographiquesCodes.map((code) => ({ code })) },
        }),
      },
      select: profilSelect,
    });
    return toSnapshot(row);
  }

  async updatePhoto(input: UpdatePhotoInput, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).conseillerProfile.update({
      where: { id: input.id },
      data: {
        photoS3Key: input.photoS3Key,
        photoWidth: input.photoWidth,
        photoHeight: input.photoHeight,
        photoContentType: input.photoContentType,
      },
    });
  }

  async clearPhoto(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).conseillerProfile.update({
      where: { id },
      data: {
        photoS3Key: null,
        photoWidth: null,
        photoHeight: null,
        photoContentType: null,
      },
    });
  }

  async updateStatut(input: UpdateStatutInput, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).conseillerProfile.update({
      where: { id: input.id },
      data: {
        statut: input.statut,
        raisonMasquageAdmin: input.raisonMasquageAdmin ?? null,
      },
    });
  }

  async publish(input: PublishProfilInput, tx?: Prisma.TransactionClient): Promise<void> {
    await this.db(tx).conseillerProfile.update({
      where: { id: input.id },
      data: { slug: input.slug, publishedAt: input.publishedAt, statut: 'pret' },
    });
  }

  async anonymize(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    // FR-016 — efface PII, vide les sets M-N, statut terminal 'anonymise'.
    // Le slug est conservé pour copie vers SlugReservation (cf. T038).
    // Triggers Postgres garantissent que statut='anonymise' est irréversible.
    await this.db(tx).conseillerProfile.update({
      where: { id },
      data: {
        titre: null,
        biographie: null,
        anneesExperience: null,
        afficherNomComplet: false,
        photoS3Key: null,
        photoWidth: null,
        photoHeight: null,
        photoContentType: null,
        statut: 'anonymise',
        anonymizedAt: new Date(),
        specialites: { set: [] },
        langues: { set: [] },
        zonesGeographiques: { set: [] },
      },
    });
  }
}
