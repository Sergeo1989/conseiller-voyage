// T040 — Port SuppressionListWriter (ISP — écriture).

import type { SuppressionSource } from '../../domain/entities/suppression-list-entry.entity';
import type { SuppressionReason } from '../../domain/enums/suppression-reason.enum';

export interface UpsertSuppressionInput {
  readonly recipientEmailHashHMAC: string;
  readonly reason: SuppressionReason;
  readonly source: SuppressionSource;
  readonly details?: Record<string, unknown>;
  /** null = permanent. */
  readonly expiresAt: Date | null;
}

export interface RemoveSuppressionInput {
  readonly id: string;
  readonly removedByActorId: string;
  readonly removedReason: string;
}

export interface SuppressionListWriter {
  upsert(input: UpsertSuppressionInput): Promise<{ id: string; created: boolean }>;
  softRemove(input: RemoveSuppressionInput): Promise<void>;
  /** Marque comme expirée (cron quotidien SuppressionListExpirationSweepJob). */
  markExpired(ids: ReadonlyArray<string>): Promise<number>;
}

export const SUPPRESSION_LIST_WRITER = Symbol.for('NotificationsSuppressionListWriter');
