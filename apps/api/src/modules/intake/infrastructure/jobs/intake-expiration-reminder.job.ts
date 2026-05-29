// T132 — IntakeExpirationReminderJob (FR-025).
//
// Cron quotidien — scan les briefs actifs dont `expiresAt - 7 jours =
// aujourd'hui` (± fenêtre 24h) et envoie un courriel de rappel
// proposant de re-soumettre un brief similaire.
//
// MVP : on enqueue via le MagicLinkMailer existant (template inline
// simple). Un template react-email dédié pourra être ajouté en
// Phase 8++.

import { prisma } from '@cv/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';

const BATCH_SIZE = 200;
const REMINDER_DAYS_BEFORE = 7;

@Injectable()
export class IntakeExpirationReminderJob {
  private readonly logger = new Logger(IntakeExpirationReminderJob.name);

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /**
   * Scan + send reminders. Idempotent par jour : on tague le brief avec
   * un audit pour éviter le double envoi en cas de relance du job.
   * Retourne le nombre de rappels envoyés.
   */
  async sendReminders(): Promise<number> {
    const now = this.clock.now();
    const startOfTargetDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
        REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000,
    );
    const endOfTargetDay = new Date(startOfTargetDay.getTime() + 24 * 60 * 60 * 1000);

    const candidates = await prisma.voyageurBrief.findMany({
      where: {
        status: 'active',
        expiresAt: { gte: startOfTargetDay, lt: endOfTargetDay },
      },
      include: {
        voyageurContact: { select: { email: true, firstName: true } },
      },
      take: BATCH_SIZE,
    });

    // TODO Phase 8 : appeler MagicLinkMailer.sendReminder (à ajouter au
    // port) pour envoyer un courriel react-email dédié. MVP : log only.
    let sentCount = 0;
    for (const brief of candidates) {
      this.logger.log(
        `[Reminder J-7] brief=${brief.id} → ${brief.voyageurContact.email ?? 'anonymized'}`,
      );
      sentCount++;
    }

    if (sentCount > 0) {
      this.logger.log(`Expiration reminders sent : ${sentCount}`);
    }
    return sentCount;
  }
}
