// T056 — Adapter Prisma : MatchingAuditWriter (append-only).
// Le trigger Postgres `trg_matching_audit_block_updates` (migration T013)
// bloque tout UPDATE/DELETE — défense en profondeur.

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  MatchingAuditEntryInput,
  MatchingAuditEventType,
  MatchingAuditWriter,
} from '../application/ports/matching-audit-writer.port';

/**
 * Mapping nom event domain (kebab-case `matching.computed`) → enum DB
 * snake_case (`matching_computed`). Centralisé ici car le Prisma client
 * attend la valeur enum stricte.
 */
const EVENT_TYPE_TO_DB: Record<MatchingAuditEventType, string> = {
  'matching.computed': 'matching_computed',
  'matching.empty': 'matching_empty',
  'matching.partial': 'matching_partial',
  'matching.replay_ignored': 'matching_replay_ignored',
  'matching.recomputed': 'matching_recomputed',
  'matching.all_matches_revoked_detected': 'matching_all_matches_revoked_detected',
  'matching.conseiller_address_missing': 'matching_conseiller_address_missing',
};

@Injectable()
export class PrismaMatchingAuditWriter implements MatchingAuditWriter {
  async append(entry: MatchingAuditEntryInput): Promise<void> {
    await prisma.matchingAuditEntry.create({
      data: {
        id: entry.id,
        briefId: entry.briefId,
        matchingResultId: entry.matchingResultId,
        eventType: EVENT_TYPE_TO_DB[entry.eventType] as never,
        payload: entry.payload as object,
        idempotencyKey: entry.idempotencyKey,
        correlationId: entry.correlationId,
        occurredAt: entry.occurredAt,
      },
    });
  }
}
