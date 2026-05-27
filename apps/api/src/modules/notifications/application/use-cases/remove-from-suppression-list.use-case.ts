// T121 — RemoveFromSuppressionListUseCase — GREEN T119.
// Retrait manuel d'une adresse de la suppression list (faux positifs).
// Exige un motif ≥ 10 chars (FR-028).

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  NOTIFICATION_AUDIT_LOG_WRITER,
  type NotificationAuditLogWriter,
} from '../ports/notification-audit-log-writer.port';
import {
  SUPPRESSION_LIST_READER,
  type SuppressionListReader,
} from '../ports/suppression-list-reader.port';
import {
  SUPPRESSION_LIST_WRITER,
  type SuppressionListWriter,
} from '../ports/suppression-list-writer.port';

export interface RemoveFromSuppressionListInput {
  readonly id: string;
  readonly actorId: string;
  readonly reason: string;
}

export interface RemoveFromSuppressionListOutput {
  readonly removed: true;
  readonly removedAt: Date;
}

@Injectable()
export class RemoveFromSuppressionListUseCase {
  constructor(
    @Inject(SUPPRESSION_LIST_READER) private readonly suppressionReader: SuppressionListReader,
    @Inject(SUPPRESSION_LIST_WRITER) private readonly suppressionWriter: SuppressionListWriter,
    @Inject(NOTIFICATION_AUDIT_LOG_WRITER) private readonly auditWriter: NotificationAuditLogWriter,
  ) {}

  async execute(input: RemoveFromSuppressionListInput): Promise<RemoveFromSuppressionListOutput> {
    if (input.reason.trim().length < 10) {
      throw new Error('reason must be at least 10 characters (FR-028)');
    }

    const entry = await this.suppressionReader.findById(input.id);
    if (!entry) {
      throw new NotFoundException(`Suppression list entry not found: ${input.id}`);
    }
    if (entry.removedAt !== null) {
      throw new ConflictException(`Entry already removed at ${entry.removedAt.toISOString()}`);
    }

    await this.suppressionWriter.softRemove({
      id: input.id,
      removedByActorId: input.actorId,
      removedReason: input.reason,
    });

    const removedAt = new Date();
    await this.auditWriter.append({
      eventType: 'notification.suppression.removed_manual',
      actorId: input.actorId,
      actorRole: 'admin',
      targetEmailHashHMAC: entry.recipientEmailHashHMAC,
      reason: input.reason,
      metadata: { suppressionId: input.id, previousReason: entry.reason },
    });

    return { removed: true, removedAt };
  }
}

export const REMOVE_FROM_SUPPRESSION_LIST_USE_CASE = Symbol.for(
  'NotificationsRemoveFromSuppressionListUseCase',
);
