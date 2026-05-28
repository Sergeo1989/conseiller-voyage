// LireProfilAdminUseCase (feature 007 US6, console admin).
//
// Lecture par profilId (PK ConseillerProfile.id) — pas par authUserId.
// Combine :
//   - profil (titre, biographie, statut, slug, photo, M-N, raisonMasquage)
//   - nom légal de l'AuthUser
//   - statut conformité
//   - historique modérations admin (DESC)
//
// Utilisé par la console admin pour afficher le détail + l'audit trail.
// L'admin connaît l'ID parce qu'il navigue depuis la liste ou un lien
// d'alerte ; on évite donc d'exposer un endpoint qui prendrait le slug
// (slug = vue publique).

import { formaterNomAffiche } from '@cv/profil-domain';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUTH_USER_LEGAL_NAME_READER,
  type AuthUserLegalNameReader,
} from '../ports/auth-user-legal-name-reader.port';
import {
  PROFIL_CONSEILLER_REPOSITORY,
  type ProfilConseillerRepository,
} from '../ports/profil-conseiller-repository.port';
import {
  PROFIL_MODERATION_AUDIT_READER,
  type ProfilModerationAuditEntry,
  type ProfilModerationAuditReader,
} from '../ports/profil-moderation-audit-reader.port';

export interface LireProfilAdminInput {
  readonly profilId: string;
}

export interface ProfilAdminPayload {
  readonly profilId: string;
  readonly authUserId: string;
  readonly nomLegal: { prenom: string; nom: string };
  readonly nomAffiche: string;
  readonly slug: string | null;
  readonly statut: 'incomplet' | 'pret' | 'masque_admin' | 'anonymise';
  readonly raisonMasquageAdmin: string | null;
  readonly verifie: boolean;
  readonly lastVerifiedAt: string | null;
  readonly titre: string | null;
  readonly biographie: string | null;
  readonly anneesExperience: number | null;
  readonly afficherNomComplet: boolean;
  readonly specialitesCodes: readonly string[];
  readonly languesCodes: readonly string[];
  readonly zonesGeographiquesCodes: readonly string[];
  readonly photoS3Key: string | null;
  readonly publishedAt: string | null;
  readonly anonymizedAt: string | null;
  readonly historiqueModerations: readonly {
    readonly id: string;
    readonly action: ProfilModerationAuditEntry['action'];
    readonly raison: string;
    readonly adminEmailHash: string;
    readonly occurredAt: string;
  }[];
}

@Injectable()
export class LireProfilAdminUseCase {
  constructor(
    @Inject(PROFIL_CONSEILLER_REPOSITORY)
    private readonly profilRepo: ProfilConseillerRepository,
    @Inject(AUTH_USER_LEGAL_NAME_READER)
    private readonly legalName: AuthUserLegalNameReader,
    @Inject(CONFORMITE_QUERY_PORT)
    private readonly conformite: ConformiteQueryPort,
    @Inject(PROFIL_MODERATION_AUDIT_READER)
    private readonly moderationAuditReader: ProfilModerationAuditReader,
  ) {}

  async execute(input: LireProfilAdminInput): Promise<ProfilAdminPayload> {
    const profil = await this.profilRepo.findById(input.profilId);
    if (!profil) throw new NotFoundException({ code: 'PROFIL_NOT_FOUND' });

    const nomLegal = await this.legalName.lireNomLegal(profil.authUserId);
    // Profil anonymisé : pas de nom légal récupérable — on affiche [anonymisé]
    const nomLegalSafe = nomLegal ?? { prenomLegal: '[anonymisé]', nomLegal: '' };

    const conformiteStatus = await this.conformite
      .getVerificationStatus({ conseillerId: profil.authUserId, strict: false })
      .catch(() => ({
        conseillerId: profil.authUserId,
        verified: false,
        lastVerifiedAt: null,
      }));

    const historique = await this.moderationAuditReader.listByProfileId(profil.id);

    return {
      profilId: profil.id,
      authUserId: profil.authUserId,
      nomLegal: { prenom: nomLegalSafe.prenomLegal, nom: nomLegalSafe.nomLegal },
      nomAffiche: nomLegal
        ? formaterNomAffiche({
            prenomLegal: nomLegal.prenomLegal,
            nomLegal: nomLegal.nomLegal,
            afficherNomComplet: profil.afficherNomComplet,
          })
        : '[anonymisé]',
      slug: profil.slug,
      statut: profil.statut,
      raisonMasquageAdmin: profil.raisonMasquageAdmin,
      verifie: conformiteStatus.verified,
      lastVerifiedAt: conformiteStatus.lastVerifiedAt,
      titre: profil.titre,
      biographie: profil.biographie,
      anneesExperience: profil.anneesExperience,
      afficherNomComplet: profil.afficherNomComplet,
      specialitesCodes: profil.specialitesCodes,
      languesCodes: profil.languesCodes,
      zonesGeographiquesCodes: profil.zonesGeographiquesCodes,
      photoS3Key: profil.photoS3Key,
      publishedAt: profil.publishedAt?.toISOString() ?? null,
      anonymizedAt: profil.anonymizedAt?.toISOString() ?? null,
      historiqueModerations: historique.map((h) => ({
        id: h.id,
        action: h.action,
        raison: h.raison,
        adminEmailHash: h.adminEmailHash,
        occurredAt: h.occurredAt.toISOString(),
      })),
    };
  }
}
