// T106 — PrevisualiserProfilUseCase (feature 007 US4).
//
// Variante "aperçu" de LirePageProfilPublique : renvoie le payload même
// si le profil n'est pas en état d'être publié (avec un bandeau décrivant
// la raison). Le conseiller peut prévisualiser ce que le voyageur verra.

import { formaterNomAffiche } from '@cv/profil-domain';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import { Inject, Injectable } from '@nestjs/common';
import { env } from '../../../../env';
import {
  AUTH_USER_LEGAL_NAME_READER,
  type AuthUserLegalNameReader,
} from '../ports/auth-user-legal-name-reader.port';
import {
  PROFIL_CONSEILLER_REPOSITORY,
  type ProfilConseillerRepository,
} from '../ports/profil-conseiller-repository.port';

export interface PrevisualiserProfilInput {
  readonly authUserId: string;
}

export interface ProfilPreviewPayload {
  readonly payloadPublic: {
    readonly conseillerId: string;
    readonly slug: string | null;
    readonly nomAffiche: string;
    readonly titre: string | null;
    readonly biographie: string | null;
    readonly photoUrlPublique: string | null;
    readonly photoWidth: number | null;
    readonly photoHeight: number | null;
    readonly specialitesCodes: readonly string[];
    readonly languesCodes: readonly string[];
    readonly zonesGeographiquesCodes: readonly string[];
    readonly anneesExperience: number | null;
    readonly verifieOPCTICO: boolean;
  };
  readonly bandeauApercu: {
    readonly type: 'profil_incomplet' | 'non_verifie' | 'masque_admin' | 'anonymise';
    readonly elementsManquants: readonly string[];
    readonly raisonMasquage: string | null;
  } | null;
}

@Injectable()
export class PrevisualiserProfilUseCase {
  constructor(
    @Inject(PROFIL_CONSEILLER_REPOSITORY)
    private readonly repo: ProfilConseillerRepository,
    @Inject(AUTH_USER_LEGAL_NAME_READER)
    private readonly legalName: AuthUserLegalNameReader,
    @Inject(CONFORMITE_QUERY_PORT)
    private readonly conformite: ConformiteQueryPort,
  ) {}

  async execute(input: PrevisualiserProfilInput): Promise<ProfilPreviewPayload | null> {
    const profil = await this.repo.findByAuthUserId(input.authUserId);
    if (!profil) return null;

    const nomLegal = await this.legalName.lireNomLegal(input.authUserId);
    if (!nomLegal) return null;

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
      payloadPublic: {
        conseillerId: profil.authUserId,
        slug: profil.slug,
        nomAffiche,
        titre: profil.titre,
        biographie: profil.biographie,
        photoUrlPublique: profil.photoS3Key ? this.buildPhotoUrl(profil.photoS3Key) : null,
        photoWidth: profil.photoWidth,
        photoHeight: profil.photoHeight,
        specialitesCodes: profil.specialitesCodes,
        languesCodes: profil.languesCodes,
        zonesGeographiquesCodes: profil.zonesGeographiquesCodes,
        anneesExperience: profil.anneesExperience,
        verifieOPCTICO: conformiteStatus.verified,
      },
      bandeauApercu: computeBandeau(profil, conformiteStatus.verified),
    };
  }

  private buildPhotoUrl(s3Key: string): string {
    const base = env.CLOUDFRONT_PROFILES_PUBLIC_URL.replace(/\/+$/, '');
    return `${base}/${s3Key}`;
  }
}

interface ProfilBandeauInput {
  readonly statut: string;
  readonly raisonMasquageAdmin: string | null;
  readonly titre: string | null;
  readonly biographie: string | null;
  readonly photoS3Key: string | null;
  readonly anneesExperience: number | null;
  readonly specialitesCodes: readonly string[];
  readonly languesCodes: readonly string[];
  readonly zonesGeographiquesCodes: readonly string[];
}

function listerElementsManquants(profil: ProfilBandeauInput): string[] {
  const manquants: string[] = [];
  if (!profil.titre) manquants.push('titre');
  if (!profil.biographie || profil.biographie.length < 100) manquants.push('biographie');
  if (profil.specialitesCodes.length === 0) manquants.push('spécialités');
  if (profil.languesCodes.length === 0) manquants.push('langues');
  if (profil.zonesGeographiquesCodes.length === 0) manquants.push('zones géographiques');
  if (profil.anneesExperience === null) manquants.push("années d'expérience");
  if (!profil.photoS3Key) manquants.push('photo');
  return manquants;
}

function computeBandeau(
  profil: ProfilBandeauInput,
  verifie: boolean,
): ProfilPreviewPayload['bandeauApercu'] {
  if (profil.statut === 'anonymise') {
    return { type: 'anonymise', elementsManquants: [], raisonMasquage: null };
  }
  if (profil.statut === 'masque_admin') {
    return {
      type: 'masque_admin',
      elementsManquants: [],
      raisonMasquage: profil.raisonMasquageAdmin,
    };
  }
  if (!verifie) {
    return { type: 'non_verifie', elementsManquants: [], raisonMasquage: null };
  }
  if (profil.statut === 'pret') return null;
  return {
    type: 'profil_incomplet',
    elementsManquants: listerElementsManquants(profil),
    raisonMasquage: null,
  };
}
