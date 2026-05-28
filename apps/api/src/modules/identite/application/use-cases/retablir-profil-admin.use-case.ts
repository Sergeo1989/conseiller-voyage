// T118 — RetablirProfilAdminUseCase (feature 007 US6 FR-023).
//
// Lève le masquage admin → le calcul dérivé reprend (statut = incomplet
// si profil incomplet, prêt sinon). Pas de courriel automatique.

import { prisma } from '@cv/db';
import { type Result, calculerStatutProfil, err, ok, profilEstComplet } from '@cv/profil-domain';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime class references
import { ProfilCacheInvalidator } from '../listeners/profil-cache-invalidation.listener';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import {
  PROFIL_CONSEILLER_REPOSITORY,
  type ProfilConseillerRepository,
} from '../ports/profil-conseiller-repository.port';
import {
  PROFIL_MODERATION_AUDIT_WRITER,
  type ProfilModerationAuditWriter,
} from '../ports/profil-moderation-audit-writer.port';

export interface RetablirProfilAdminInput {
  readonly adminAuthUserId: string;
  readonly adminEmail: string;
  readonly conseillerProfileId: string;
  readonly raison?: string;
}

export interface RetablirProfilAdminSuccess {
  readonly nouveauStatutEffectif: 'incomplet' | 'pret';
}

export type RetablirProfilAdminError =
  | { kind: 'PROFIL_NOT_FOUND' }
  | { kind: 'PROFIL_ANONYMISE' }
  | { kind: 'PAS_MASQUE' };

@Injectable()
export class RetablirProfilAdminUseCase {
  constructor(
    @Inject(PROFIL_CONSEILLER_REPOSITORY)
    private readonly profilRepo: ProfilConseillerRepository,
    @Inject(CONFORMITE_QUERY_PORT)
    private readonly conformite: ConformiteQueryPort,
    @Inject(PROFIL_MODERATION_AUDIT_WRITER)
    private readonly moderationAudit: ProfilModerationAuditWriter,
    @Inject(AUTH_AUDIT_WRITER)
    private readonly authAudit: AuthAuditWriter,
    private readonly cacheInvalidator: ProfilCacheInvalidator,
  ) {}

  async execute(
    input: RetablirProfilAdminInput,
  ): Promise<Result<RetablirProfilAdminSuccess, RetablirProfilAdminError>> {
    const profil = await this.profilRepo.findById(input.conseillerProfileId);
    if (!profil) return err({ kind: 'PROFIL_NOT_FOUND' as const });
    if (profil.statut === 'anonymise') return err({ kind: 'PROFIL_ANONYMISE' as const });
    if (profil.statut !== 'masque_admin') return err({ kind: 'PAS_MASQUE' as const });

    // Recalcul statut effectif
    const conformiteStatus = await this.conformite
      .getVerificationStatus({ conseillerId: profil.authUserId, strict: false })
      .catch(() => ({ verified: false, conseillerId: profil.authUserId, lastVerifiedAt: null }));

    const complet = profilEstComplet({
      titre: profil.titre,
      biographie: profil.biographie,
      specialitesCount: profil.specialitesCodes.length,
      languesCount: profil.languesCodes.length,
      zonesGeographiquesCount: profil.zonesGeographiquesCodes.length,
      anneesExperience: profil.anneesExperience,
      photoS3Key: profil.photoS3Key,
    });
    const nouveauStatut = calculerStatutProfil({
      verifie: conformiteStatus.verified,
      profilComplet: complet,
      masqueAdmin: false,
      anonymise: false,
    });
    const statutOk =
      nouveauStatut === 'anonymise' || nouveauStatut === 'masque_admin'
        ? ('incomplet' as const)
        : nouveauStatut;

    await prisma.$transaction(async (tx) => {
      await this.profilRepo.updateStatut(
        { id: profil.id, statut: statutOk, raisonMasquageAdmin: null },
        tx,
      );
      await this.moderationAudit.append(
        {
          profileId: profil.id,
          adminAuthUserId: input.adminAuthUserId,
          adminEmail: input.adminEmail,
          action: 'retablissement',
          raison: input.raison ?? 'Rétablissement administratif',
        },
        tx,
      );
    });

    await this.authAudit.append({
      eventType: 'signup',
      actorUserId: input.adminAuthUserId,
      targetUserId: profil.authUserId,
      metadata: { action: 'profil.retabli.admin', nouveauStatut: statutOk },
    });

    if (profil.slug) await this.cacheInvalidator.invalidateProfilSlug(profil.slug);

    return ok({ nouveauStatutEffectif: statutOk });
  }
}
