// T131 — IntakeBriefExpirationSweepJob (FR-024).
//
// Sweep quotidien des briefs actifs dont `expiresAt < now()` :
//   1. Marquer brief.status = 'anonymized' + anonymizedAt = now
//   2. Publier outbox voyageur.brief.expired (pour matching 011 +
//      audit Loi 25)
//   3. Append audit intake.brief.expired
//
// **NE TOUCHE PAS** au contact (un voyageur peut avoir d'autres briefs
// actifs). L'anonymisation contact est gérée séparément par la demande
// explicite FR-022a (effacer-tout).
//
// Cf. spec.md FR-024 + runbook docs/runbooks/intake-anonymisation-loi25.md.

import { prisma } from '@cv/db';
import type { IntakeAuditEntryId, IntakeOutboxEntryId } from '@cv/shared/intake';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import {
  INTAKE_AUDIT_LOG_WRITER,
  INTAKE_OUTBOX_WRITER,
  type IntakeAuditLogWriter,
  type IntakeOutboxWriter,
} from '../../application/ports';

const BATCH_SIZE = 100;

@Injectable()
export class IntakeBriefExpirationSweepJob {
  private readonly logger = new Logger(IntakeBriefExpirationSweepJob.name);

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuid: UuidGenerator,
    @Inject(INTAKE_AUDIT_LOG_WRITER) private readonly audit: IntakeAuditLogWriter,
    @Inject(INTAKE_OUTBOX_WRITER) private readonly outbox: IntakeOutboxWriter,
  ) {}

  /**
   * Sweep une fenêtre. À appeler via BullMQ repeatable ou
   * @nestjs/schedule cron 02:00 ca-central-1 quotidien.
   * Retourne le nombre de briefs expirés.
   */
  async sweep(): Promise<number> {
    const now = this.clock.now();
    const expired = await prisma.voyageurBrief.findMany({
      where: {
        OR: [{ status: 'active' }, { status: 'matched' }],
        expiresAt: { lt: now },
      },
      take: BATCH_SIZE,
      orderBy: { expiresAt: 'asc' },
    });

    if (expired.length === 0) return 0;

    for (const brief of expired) {
      await prisma.voyageurBrief.update({
        where: { id: brief.id },
        data: {
          status: 'anonymized',
          anonymizedAt: now,
        },
      });
      await this.audit.append({
        id: this.uuid.generate() as IntakeAuditEntryId,
        voyageurBriefId: brief.id as never,
        voyageurContactId: brief.voyageurContactId as never,
        eventType: 'intake.brief.expired',
        actorRole: 'system',
        actorId: null,
        occurredAt: now,
        payload: {
          expirationDays: Math.floor(
            (now.getTime() - brief.submittedAt.getTime()) / (24 * 60 * 60 * 1000),
          ),
        },
        idempotencyKey: null,
        correlationId: null,
      });
      await this.outbox.enqueue({
        id: this.uuid.generate() as IntakeOutboxEntryId,
        eventType: 'voyageur.brief.expired',
        payload: {
          briefId: brief.id,
          expiredAt: now.toISOString(),
          hadMatchedConseillers: brief.status === 'matched',
        },
      });
    }

    this.logger.log(
      `Expiration sweep : ${expired.length} briefs anonymisés (cutoff ${now.toISOString()})`,
    );
    return expired.length;
  }
}
