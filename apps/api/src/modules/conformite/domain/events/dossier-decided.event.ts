// T041 — Domain event DossierDecided.
// Publié quand un admin approuve ou refuse un dossier (US1, FR-004).
// Cf. contracts/events.md.

import type { AdminId, ConseillerId, SubmissionId } from '@cv/shared/conformite';

export type DossierDecision = 'approved' | 'refused';

export interface DossierDecidedEvent {
  readonly type: 'conformite.dossier.decided';
  readonly conseillerId: ConseillerId;
  readonly submissionId: SubmissionId;
  readonly decision: DossierDecision;
  readonly reason: string | null; // requis si decision === 'refused', ≥ 20 chars (FR-004)
  readonly adminId: AdminId;
  readonly occurredAt: Date;
}
