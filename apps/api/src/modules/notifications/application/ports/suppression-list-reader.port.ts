// T039 — Port SuppressionListReader (ISP — lecture seule).

import type { SuppressionListEntry } from '../../domain/entities/suppression-list-entry.entity';
import type { SuppressionReason } from '../../domain/enums/suppression-reason.enum';

export interface SuppressionListReader {
  findById(id: string): Promise<SuppressionListEntry | null>;
  findByEmailHash(hash: string): Promise<SuppressionListEntry | null>;
  list(filters: {
    reason?: SuppressionReason;
    includeRemoved?: boolean;
    page: number;
    pageSize: number;
  }): Promise<{
    items: ReadonlyArray<SuppressionListEntry>;
    totalCount: number;
  }>;
}

export const SUPPRESSION_LIST_READER = Symbol.for('NotificationsSuppressionListReader');
