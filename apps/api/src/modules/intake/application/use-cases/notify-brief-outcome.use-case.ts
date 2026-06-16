// T013 [017 US1] — NotifyBriefOutcomeUseCase : implémente le port public
// VoyageurMatchNotifier (appelé par le consumer matching déjà dédupliqué).
//
// Applique selectNotificationForOutcome (type + anti-spam), puis enqueue une
// VoyageurNotification idempotente. Best-effort : ne throw JAMAIS vers matching
// (un échec d'enqueue ne doit pas casser le traitement de matching ; le drain
// outbox + la réconciliation de leads 012 sont les filets).

import type { BriefOutcomeNotification, VoyageurMatchNotifier } from '@cv/shared/intake';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import { selectNotificationForOutcome } from '../../domain/services/select-notification-for-outcome';
import type { VoyageurNotificationOutbox } from '../ports';

export interface NotifyBriefOutcomeDeps {
  readonly clock: Clock;
  readonly uuid: UuidGenerator;
  readonly outbox: VoyageurNotificationOutbox;
}

@Injectable()
export class NotifyBriefOutcomeUseCase implements VoyageurMatchNotifier {
  private readonly logger = new Logger(NotifyBriefOutcomeUseCase.name);

  constructor(
    @Inject(NotifyBriefOutcomeUseCase.DEPS_TOKEN)
    private readonly deps: NotifyBriefOutcomeDeps,
  ) {}

  static readonly DEPS_TOKEN = Symbol.for('NotifyBriefOutcomeDeps');

  async onBriefOutcome(input: BriefOutcomeNotification): Promise<void> {
    try {
      const last = await this.deps.outbox.lastOutcomeForBrief(input.briefId);
      const { type, suppressed } = selectNotificationForOutcome(input.outcome, last);
      if (suppressed) return; // anti-spam (FR-014)

      await this.deps.outbox.enqueue({
        id: this.deps.uuid.generate(),
        briefId: input.briefId,
        type,
        idempotencyKey: input.idempotencyKey,
        outcome: input.outcome,
        conseillerIds: input.conseillerIds,
        createdAt: this.deps.clock.now(),
      });
    } catch (err) {
      // Best-effort : ne jamais propager vers matching (Principe X).
      this.logger.warn(
        `Notification voyageur non enqueue (brief ${input.briefId}) : ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
