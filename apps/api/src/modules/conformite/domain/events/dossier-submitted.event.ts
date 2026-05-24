// T041 — Domain event DossierSubmitted.
// Publié quand un conseiller soumet un dossier complet (US1).
// Cf. contracts/events.md.

import type { ConseillerId, SubmissionId } from '@cv/shared/conformite';

export interface DossierSubmittedEvent {
  readonly type: 'conformite.dossier.submitted';
  readonly conseillerId: ConseillerId;
  readonly submissionId: SubmissionId;
  readonly certificateCount: number;
  readonly affiliationCount: number;
  readonly occurredAt: Date;
}
