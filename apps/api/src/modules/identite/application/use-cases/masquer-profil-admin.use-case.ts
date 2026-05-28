// T117 — MasquerProfilAdminUseCase (feature 007 US6 FR-023).

import { prisma } from '@cv/db';
import { type Result, err, ok } from '@cv/profil-domain';
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

export interface MasquerProfilAdminInput {
  readonly adminAuthUserId: string;
  readonly adminEmail: string;
  readonly conseillerProfileId: string;
  readonly raison: string;
}

export interface MasquerProfilAdminSuccess {
  readonly statutPrecedent: 'incomplet' | 'pret';
}

export type MasquerProfilAdminError =
  | { kind: 'PROFIL_NOT_FOUND' }
  | { kind: 'PROFIL_ANONYMISE' }
  | { kind: 'DEJA_MASQUE' }
  | { kind: 'RAISON_TROP_COURTE' };

@Injectable()
export class MasquerProfilAdminUseCase {
  constructor(
    @Inject(PROFIL_CONSEILLER_REPOSITORY)
    private readonly profilRepo: ProfilConseillerRepository,
    @Inject(PROFIL_MODERATION_AUDIT_WRITER)
    private readonly moderationAudit: ProfilModerationAuditWriter,
    @Inject(AUTH_AUDIT_WRITER)
    private readonly authAudit: AuthAuditWriter,
    private readonly cacheInvalidator: ProfilCacheInvalidator,
  ) {}

  async execute(
    input: MasquerProfilAdminInput,
  ): Promise<Result<MasquerProfilAdminSuccess, MasquerProfilAdminError>> {
    if (input.raison.trim().length < 10) return err({ kind: 'RAISON_TROP_COURTE' as const });
    const profil = await this.profilRepo.findById(input.conseillerProfileId);
    if (!profil) return err({ kind: 'PROFIL_NOT_FOUND' as const });
    if (profil.statut === 'anonymise') return err({ kind: 'PROFIL_ANONYMISE' as const });
    if (profil.statut === 'masque_admin') return err({ kind: 'DEJA_MASQUE' as const });

    await prisma.$transaction(async (tx) => {
      await this.profilRepo.updateStatut(
        { id: profil.id, statut: 'masque_admin', raisonMasquageAdmin: input.raison },
        tx,
      );
      await this.moderationAudit.append(
        {
          profileId: profil.id,
          adminAuthUserId: input.adminAuthUserId,
          adminEmail: input.adminEmail,
          action: 'masquage',
          raison: input.raison,
        },
        tx,
      );
    });

    await this.authAudit.append({
      eventType: 'signup',
      actorUserId: input.adminAuthUserId,
      targetUserId: profil.authUserId,
      metadata: { action: 'profil.masque.admin', raison: input.raison },
    });

    if (profil.slug) await this.cacheInvalidator.invalidateProfilSlug(profil.slug);

    return ok({ statutPrecedent: profil.statut === 'pret' ? 'pret' : 'incomplet' });
  }
}
