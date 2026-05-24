// T043 — STUB pour Phase 3A. Implémentation réelle dans le commit suivant.
// Le throw rend tous les tests T032 RED visible.

import type { Affiliation } from '../entities/affiliation.entity';
import type { Certificat } from '../entities/certificat.entity';
import type { PermitRevocation } from '../entities/permit-revocation.entity';
import type { ConformiteStatus } from '../value-objects/conformite-status.vo';

export interface ComputeConformiteStatusInput {
  readonly currentStatus: ConformiteStatus;
  readonly certificats: ReadonlyArray<Certificat>;
  readonly affiliations: ReadonlyArray<Affiliation>;
  readonly permitRevocations: ReadonlyArray<PermitRevocation>;
  readonly now: Date;
}

export function computeConformiteStatus(_input: ComputeConformiteStatusInput): ConformiteStatus {
  throw new Error('computeConformiteStatus not yet implemented (T043 — TDD red).');
}
