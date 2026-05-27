// T035 — Entité SuppressionListEntry (vue domaine).

import type { SuppressionReason } from '../enums/suppression-reason.enum';

export type SuppressionSource =
  | 'ses_sns_bounce'
  | 'ses_sns_complaint'
  | 'manual_admin'
  | 'system_auto';

export interface SuppressionListEntry {
  readonly id: string;
  readonly recipientEmailHashHMAC: string;
  readonly reason: SuppressionReason;
  readonly source: SuppressionSource;
  readonly details: Record<string, unknown> | null;
  readonly addedAt: Date;
  /** null = permanent. Non-null = soft bounce TTL. */
  readonly expiresAt: Date | null;
  /** Non-null = soft-deleted par admin. */
  readonly removedAt: Date | null;
  readonly removedByActorId: string | null;
  readonly removedReason: string | null;
}
