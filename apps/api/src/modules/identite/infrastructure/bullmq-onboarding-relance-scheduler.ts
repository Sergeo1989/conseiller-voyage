// T041 — BullmqOnboardingRelanceScheduler (feature 007, FR-021 + R8).
//
// Impl du port OnboardingRelanceScheduler (T031). 3 jobs delayed
// (J+3, J+7, J+14) avec jobId déterministe pour idempotence. Le worker
// `onboarding-reminders.worker.ts` (T137) consommera ces jobs et
// déléguera à EnvoyerRelanceOnboardingUseCase.

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  ETAPE_DELAY_MS,
  type OnboardingRelanceScheduler,
  type PlanifierRelancesInput,
} from '../application/ports/onboarding-relance-scheduler.port';

/** Nom de queue BullMQ — partagé avec le worker (T137). */
export const ONBOARDING_REMINDERS_QUEUE = 'identite.onboarding-reminders';
export const SEND_ONBOARDING_REMINDER_JOB = 'send-onboarding-reminder';

function jobIdFor(profileId: string, etape: 'j3' | 'j7' | 'j14'): string {
  return `onboarding-reminder-${profileId}-${etape}`;
}

@Injectable()
export class BullmqOnboardingRelanceScheduler implements OnboardingRelanceScheduler {
  private readonly logger = new Logger('OnboardingRelanceScheduler');

  constructor(
    @InjectQueue(ONBOARDING_REMINDERS_QUEUE)
    private readonly queue: Queue,
  ) {}

  async planifierRelances(input: PlanifierRelancesInput): Promise<void> {
    const verifiedAtMs = input.verifiedAt.getTime();
    const now = Date.now();
    for (const etape of ['j3', 'j7', 'j14'] as const) {
      const scheduledForMs = verifiedAtMs + ETAPE_DELAY_MS[etape];
      const delay = Math.max(0, scheduledForMs - now);
      const jobId = jobIdFor(input.profileId, etape);

      // BullMQ déduplique sur jobId : re-planification = no-op.
      await this.queue.add(
        SEND_ONBOARDING_REMINDER_JOB,
        { profileId: input.profileId, etape },
        {
          jobId,
          delay,
          attempts: 5,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: { age: 7 * 24 * 3600, count: 500 },
          removeOnFail: { age: 30 * 24 * 3600 },
        },
      );
    }
    this.logger.log(
      `Onboarding reminders planifiées pour profile=${input.profileId} (verifiedAt=${input.verifiedAt.toISOString()})`,
    );
  }

  async annulerRelances(profileId: string): Promise<void> {
    let removed = 0;
    for (const etape of ['j3', 'j7', 'j14'] as const) {
      const jobId = jobIdFor(profileId, etape);
      const job = await this.queue.getJob(jobId);
      if (job) {
        // Si déjà completed/failed, remove() est no-op ou throw — on swallow.
        try {
          await job.remove();
          removed++;
        } catch (err) {
          this.logger.debug(
            `Cannot remove job ${jobId} (probably already executed): ${(err as Error).message}`,
          );
        }
      }
    }
    if (removed > 0) {
      this.logger.log(`${removed} onboarding reminder(s) annulé(s) pour profile=${profileId}`);
    }
  }
}
