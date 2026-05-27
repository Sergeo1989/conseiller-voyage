// T136 — EnvoyerRelanceOnboardingUseCase (feature 007 FR-021).
//
// Consommé par le worker BullMQ T137. Vérifie statut profil avant envoi
// (idempotent : no-op si statut != incomplet).

import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import {
  PROFIL_CONSEILLER_REPOSITORY,
  type ProfilConseillerRepository,
} from '../ports/profil-conseiller-repository.port';

export interface EnvoyerRelanceInput {
  readonly profileId: string;
  readonly etape: 'j3' | 'j7' | 'j14';
}

@Injectable()
export class EnvoyerRelanceOnboardingUseCase {
  private readonly logger = new Logger('EnvoyerRelanceOnboarding');

  constructor(
    @Inject(PROFIL_CONSEILLER_REPOSITORY)
    private readonly profilRepo: ProfilConseillerRepository,
    @Inject(AUTH_AUDIT_WRITER)
    private readonly authAudit: AuthAuditWriter,
  ) {}

  async execute(input: EnvoyerRelanceInput): Promise<void> {
    const profil = await this.profilRepo.findById(input.profileId);
    if (!profil) {
      this.logger.warn({ profileId: input.profileId }, 'Profil introuvable — skip relance');
      return;
    }
    if (profil.statut !== 'incomplet') {
      this.logger.debug(
        { profileId: profil.id, statut: profil.statut, etape: input.etape },
        'Statut != incomplet — relance annulée (idempotence)',
      );
      return;
    }

    // Émettre l'email via le module notifications (feature 003) — pour MVP,
    // on logue l'intention. Le drainage outbox SES est déjà câblé par 003.
    // TODO(feature 003 wiring) : INSERT auth_outbox_emails template
    //   onboardingReminderJ3/J7/J14.
    this.logger.log(
      { profileId: profil.id, etape: input.etape },
      'Onboarding reminder triggered (TODO: SES outbox)',
    );

    await this.authAudit.append({
      eventType: 'signup',
      targetUserId: profil.authUserId,
      metadata: { action: 'profil.onboarding.reminder', etape: input.etape },
    });
  }
}
