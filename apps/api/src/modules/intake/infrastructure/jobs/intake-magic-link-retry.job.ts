// T133 — IntakeMagicLinkRetryJob (FR-013a).
//
// MVP stub : la stratégie retry SES est documentée mais non câblée
// en BullMQ pour ce MVP. Le `SesMagicLinkMailer.send()` throw en cas
// d'échec ; `SubmitBriefUseCase` capture l'exception et retourne
// emailSent=false. Le voyageur peut redemander un magic link via la
// page email-envoyé (bouton "renvoyer" après 120s).
//
// Phase 8++ : implémenter le retry exponentiel BullMQ (5 tentatives,
// backoff 30s → 30min) lecture d'une table `intake_outbox_emails`
// dédiée, en suivant le pattern de `auth_outbox_emails` (002).

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class IntakeMagicLinkRetryJob {
  private readonly logger = new Logger(IntakeMagicLinkRetryJob.name);

  /**
   * Stub Phase 8 MVP — log only.
   * Phase 8++ : drain `intake_outbox_emails` avec backoff exponentiel.
   */
  async drain(): Promise<number> {
    this.logger.debug('IntakeMagicLinkRetryJob.drain() — MVP stub, no-op');
    return 0;
  }
}
