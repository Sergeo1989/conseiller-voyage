// T026 — Port repository de l'agrégat ConseillerProfile (feature 007).
//
// Accès aux tables profile_conseiller_profiles + join tables M-N
// (spécialités, langues, zones). Le wiring concret se fait via
// PrismaProfilConseillerRepository (T036).

import type { Prisma } from '@cv/db';
import type { StatutProfil } from '@cv/profil-domain';

export interface ConseillerProfileSnapshot {
  readonly id: string;
  readonly authUserId: string;
  readonly titre: string | null;
  readonly biographie: string | null;
  readonly anneesExperience: number | null;
  readonly afficherNomComplet: boolean;
  readonly photoS3Key: string | null;
  readonly photoWidth: number | null;
  readonly photoHeight: number | null;
  readonly photoContentType: string | null;
  readonly slug: string | null;
  readonly statut: StatutProfil;
  readonly raisonMasquageAdmin: string | null;
  readonly publishedAt: Date | null;
  readonly anonymizedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly specialitesCodes: readonly string[];
  readonly languesCodes: readonly string[];
  readonly zonesGeographiquesCodes: readonly string[];
}

export interface CreerProfilInput {
  readonly id?: string; // pré-alloué pour atomicité (sinon UUID auto)
  readonly authUserId: string;
}

export interface UpdateProfilInput {
  readonly id: string;
  readonly titre?: string | null;
  readonly biographie?: string | null;
  readonly anneesExperience?: number | null;
  readonly afficherNomComplet?: boolean;
  readonly specialitesCodes?: readonly string[];
  readonly languesCodes?: readonly string[];
  readonly zonesGeographiquesCodes?: readonly string[];
}

export interface UpdatePhotoInput {
  readonly id: string;
  readonly photoS3Key: string;
  readonly photoWidth: number;
  readonly photoHeight: number;
  readonly photoContentType: string;
}

export interface PublishProfilInput {
  readonly id: string;
  readonly slug: string;
  readonly publishedAt: Date;
}

export interface UpdateStatutInput {
  readonly id: string;
  readonly statut: StatutProfil;
  readonly raisonMasquageAdmin?: string | null;
}

export interface ProfilConseillerRepository {
  /** Lit par PK. Retourne null si introuvable ou anonymisé. */
  findById(id: string): Promise<ConseillerProfileSnapshot | null>;
  /** Lit par AuthUser (relation 1-1). Retourne null si pas encore de profil. */
  findByAuthUserId(authUserId: string): Promise<ConseillerProfileSnapshot | null>;
  /** Lit par slug. Utilisé par LirePageProfilPublique. */
  findBySlug(slug: string): Promise<ConseillerProfileSnapshot | null>;

  /** Liste les slugs des profils publiables (statut='pret'). Sitemap + generateStaticParams. */
  listSlugsPubliables(): Promise<readonly string[]>;

  /** Crée un profil vierge (appelé par le listener ConformiteStatusChanged). */
  create(
    input: CreerProfilInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ConseillerProfileSnapshot>;
  /** Édition partielle des champs du profil. */
  update(
    input: UpdateProfilInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ConseillerProfileSnapshot>;
  /** Met à jour les références photo après upload S3 réussi. */
  updatePhoto(input: UpdatePhotoInput, tx?: Prisma.TransactionClient): Promise<void>;
  /** Vide les références photo (admin retrait ou anonymisation). */
  clearPhoto(id: string, tx?: Prisma.TransactionClient): Promise<void>;
  /** Persiste le statut effectif calculé (incomplet/pret/masque_admin/anonymise). */
  updateStatut(input: UpdateStatutInput, tx?: Prisma.TransactionClient): Promise<void>;
  /** Persiste slug + publishedAt au premier passage 'pret'. */
  publish(input: PublishProfilInput, tx?: Prisma.TransactionClient): Promise<void>;

  /** Anonymisation Loi 25 : efface PII + statut='anonymise' (irréversible). */
  anonymize(id: string, tx?: Prisma.TransactionClient): Promise<void>;
}

export const PROFIL_CONSEILLER_REPOSITORY = Symbol.for('ProfilConseillerRepository');
