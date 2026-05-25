// T041 — Domain event ConformiteStatusChanged.
// Publié à chaque transition de statut (FR-006, FR-022).
// Consommateurs typiques : module identité (notification), matching
// (invalidation cache), SEO (déréférencement), analytics.
// Cf. contracts/events.md.

import type { ConseillerId } from '@cv/shared/conformite';
import type { ConformiteStatus } from '../value-objects/conformite-status.vo';

export const STATUS_TRANSITION_CAUSES = [
  'admin_approval',
  'admin_refusal',
  'admin_revocation',
  'certificate_expiration',
  'permit_cascade',
  'renewal',
] as const;
export type StatusTransitionCause = (typeof STATUS_TRANSITION_CAUSES)[number];

export interface ConformiteStatusChangedEvent {
  readonly type: 'conformite.status.changed';
  readonly conseillerId: ConseillerId;
  readonly previousStatus: ConformiteStatus;
  readonly newStatus: ConformiteStatus;
  readonly transitionKind: 'positive' | 'negative';
  readonly cause: StatusTransitionCause;
  readonly occurredAt: Date;
  readonly correlationId: string;
}
