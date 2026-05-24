// Entité PermitRevocation (partie de T039 / FR-015).
// Déclaration admin qu'un numéro de permis d'agence n'est plus actif.
// Sert de clé pour la cascade automatique sur toutes les affiliations
// déclarant ce numéro.
// Cf. data-model.md *PermitRevocation*.

import type { PermitRevocationId } from '@cv/shared/conformite';
import type { Province } from '../value-objects/province.vo';

export interface PermitRevocation {
  readonly id: PermitRevocationId;
  readonly agencyPermitNumber: string; // valeur normalisée
  readonly agencyProvince: Province;
  readonly revokedAt: Date;
  readonly declaredByAdminId: string;
  readonly reason: string;
}
