// T037 — Entité racine ConseillerCompliance (agrégat).
// État de conformité d'un conseiller — pivot du module.
// Cf. data-model.md *ConseillerCompliance*.

import type { ConseillerComplianceId, ConseillerId } from '@cv/shared/conformite';
import type { ConformiteStatus } from '../value-objects/conformite-status.vo';

export interface ConseillerCompliance {
  readonly id: ConseillerComplianceId;
  readonly conseillerId: ConseillerId;
  readonly status: ConformiteStatus;
  readonly lastVerifiedAt: Date | null;
  readonly lastStatusChangeAt: Date;
  readonly consentToProcessGivenAt: Date | null;
  readonly erasureRequestedAt: Date | null;
  readonly anonymizedAt: Date | null;
}
