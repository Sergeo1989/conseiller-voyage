// T057 — LireProfilPriveUseCase (feature 007 US1).
//
// Lecture du profil pour l'éditeur (le conseiller lui-même OU un admin
// qui veut le détail). Combine :
//   - profil DB (titre, biographie, slug, statut, etc.)
//   - nom légal vérifié (firstName/lastName via port)
//   - statut conformité (verified, lastVerifiedAt) via ConformiteQueryPort
//   - nom affiché formaté (Marie D. ou Marie Dupont)
//   - champs manquants pour FR-012a (dashboard warning)
//
// Lecture pure — pas de side effects.

import { formaterNomAffiche, profilEstComplet } from '@cv/profil-domain';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUTH_USER_LEGAL_NAME_READER,
  type AuthUserLegalNameReader,
} from '../ports/auth-user-legal-name-reader.port';
import {
  type ConseillerProfileSnapshot,
  PROFIL_CONSEILLER_REPOSITORY,
  type ProfilConseillerRepository,
} from '../ports/profil-conseiller-repository.port';

export interface LireProfilPriveInput {
  readonly authUserId: string;
}

export interface ProfilPrivePayload {
  readonly profilId: string;
  readonly authUserId: string;

  // Champs éditables
  readonly titre: string | null;
  readonly biographie: string | null;
  readonly anneesExperience: number | null;
  readonly afficherNomComplet: boolean;
  readonly specialitesCodes: readonly string[];
  readonly languesCodes: readonly string[];
  readonly zonesGeographiquesCodes: readonly string[];

  // Photo
  readonly photoS3Key: string | null;
  readonly photoWidth: number | null;
  readonly photoHeight: number | null;

  // Nom légal + formaté
  readonly nomLegal: { prenom: string; nom: string };
  readonly nomAffiche: string;

  // Slug + statut
  readonly slug: string | null;
  readonly statut: 'incomplet' | 'pret' | 'masque_admin';
  readonly raisonMasquageAdmin: string | null;

  // Conformité (lue depuis ConformiteQueryPort)
  readonly verifie: boolean;
  readonly lastVerifiedAt: string | null;

  // FR-012a : liste des champs obligatoires manquants
  readonly champsManquants: readonly string[];

  // Méta
  readonly publishedAt: Date | null;
  readonly updatedAt: Date;
}

@Injectable()
export class LireProfilPriveUseCase {
  constructor(
    @Inject(PROFIL_CONSEILLER_REPOSITORY)
    private readonly repo: ProfilConseillerRepository,
    @Inject(AUTH_USER_LEGAL_NAME_READER)
    private readonly legalName: AuthUserLegalNameReader,
    @Inject(CONFORMITE_QUERY_PORT)
    private readonly conformite: ConformiteQueryPort,
  ) {}

  async execute(input: LireProfilPriveInput): Promise<ProfilPrivePayload> {
    const profil = await this.repo.findByAuthUserId(input.authUserId);
    if (!profil) {
      throw new NotFoundException({ code: 'PROFIL_NOT_FOUND' });
    }
    if (profil.statut === 'anonymise') {
      throw new NotFoundException({ code: 'PROFIL_ANONYMISE' });
    }

    const nomLegal = await this.legalName.lireNomLegal(input.authUserId);
    if (!nomLegal) {
      throw new NotFoundException({ code: 'NOM_LEGAL_INDISPONIBLE' });
    }

    const conformiteStatus = await this.conformite.getVerificationStatus({
      conseillerId: input.authUserId,
      strict: false,
    });

    const nomAffiche = formaterNomAffiche({
      prenomLegal: nomLegal.prenomLegal,
      nomLegal: nomLegal.nomLegal,
      afficherNomComplet: profil.afficherNomComplet,
    });

    return {
      profilId: profil.id,
      authUserId: profil.authUserId,
      titre: profil.titre,
      biographie: profil.biographie,
      anneesExperience: profil.anneesExperience,
      afficherNomComplet: profil.afficherNomComplet,
      specialitesCodes: profil.specialitesCodes,
      languesCodes: profil.languesCodes,
      zonesGeographiquesCodes: profil.zonesGeographiquesCodes,
      photoS3Key: profil.photoS3Key,
      photoWidth: profil.photoWidth,
      photoHeight: profil.photoHeight,
      nomLegal: { prenom: nomLegal.prenomLegal, nom: nomLegal.nomLegal },
      nomAffiche,
      slug: profil.slug,
      // 'anonymise' a déjà été rejeté en amont (NotFoundException).
      statut: profil.statut as 'incomplet' | 'pret' | 'masque_admin',
      raisonMasquageAdmin: profil.raisonMasquageAdmin,
      verifie: conformiteStatus.verified,
      lastVerifiedAt: conformiteStatus.lastVerifiedAt,
      champsManquants: computeChampsManquants(profil),
      publishedAt: profil.publishedAt,
      updatedAt: profil.updatedAt,
    };
  }
}

function isEmptyString(value: string | null): boolean {
  return value === null || value.trim().length === 0;
}

interface ChampCheck {
  readonly nom: string;
  readonly invalide: boolean;
}

function computeChampsManquants(profil: ConseillerProfileSnapshot): string[] {
  const checks: readonly ChampCheck[] = [
    { nom: 'titre', invalide: isEmptyString(profil.titre) },
    {
      nom: 'biographie',
      invalide: profil.biographie === null || profil.biographie.length < 100,
    },
    { nom: 'specialites', invalide: profil.specialitesCodes.length === 0 },
    { nom: 'langues', invalide: profil.languesCodes.length === 0 },
    {
      nom: 'zonesGeographiques',
      invalide: profil.zonesGeographiquesCodes.length === 0,
    },
    {
      nom: 'anneesExperience',
      invalide: profil.anneesExperience === null || profil.anneesExperience === undefined,
    },
    { nom: 'photo', invalide: isEmptyString(profil.photoS3Key) },
  ];
  const manquants = checks.filter((c) => c.invalide).map((c) => c.nom);
  if (
    manquants.length === 0 &&
    !profilEstComplet({
      titre: profil.titre,
      biographie: profil.biographie,
      specialitesCount: profil.specialitesCodes.length,
      languesCount: profil.languesCodes.length,
      zonesGeographiquesCount: profil.zonesGeographiquesCodes.length,
      anneesExperience: profil.anneesExperience,
      photoS3Key: profil.photoS3Key,
    })
  ) {
    manquants.push('inconnu');
  }
  return manquants;
}
