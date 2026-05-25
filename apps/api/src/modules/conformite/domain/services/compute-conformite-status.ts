// T043 — Fonction pure computeConformiteStatus (Principe VI NON-NÉGOCIABLE).
// Implémentée pour faire passer les tests T032 du RED au GREEN.
//
// Calcule le statut conformité agrégé à partir des faits courants
// (certificats, affiliations, retraits de permis) + le statut courant
// (pour distinguer pending de suspended et garder revoked sticky).
//
// Pas d'I/O, pas d'horloge sauvage (`now` est injecté pour testabilité).
// Cf. data-model.md *Statut de conformité du conseiller*.

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

// Helpers extraits pour respecter complexité cognitive Biome max 10.

function isCertificateCurrentlyValid(certificate: Certificat, now: Date): boolean {
  return (
    certificate.decision === 'approved' &&
    certificate.supersededById === null &&
    certificate.expiresAt > now
  );
}

function isPermitRevoked(
  affiliation: Affiliation,
  permitRevocations: ReadonlyArray<PermitRevocation>,
): boolean {
  return permitRevocations.some(
    (revocation) =>
      revocation.agencyPermitNumber === affiliation.agencyPermitNumber &&
      revocation.agencyProvince === affiliation.agencyProvince,
  );
}

function isAffiliationCurrentlyValid(
  affiliation: Affiliation,
  permitRevocations: ReadonlyArray<PermitRevocation>,
): boolean {
  if (affiliation.decision !== 'approved') return false;
  if (affiliation.inactivatedAt !== null) return false;
  return !isPermitRevoked(affiliation, permitRevocations);
}

export function computeConformiteStatus(input: ComputeConformiteStatusInput): ConformiteStatus {
  const { currentStatus, certificats, affiliations, permitRevocations, now } = input;

  // Revoked est sticky — aucune transition automatique sortante (machine d'état).
  if (currentStatus === 'revoked') {
    return 'revoked';
  }

  const hasValidCertificate = certificats.some((c) => isCertificateCurrentlyValid(c, now));
  const hasValidAffiliation = affiliations.some((a) =>
    isAffiliationCurrentlyValid(a, permitRevocations),
  );

  if (hasValidCertificate && hasValidAffiliation) {
    return 'verified';
  }

  // Déjà vérifié ou déjà suspendu → bascule en suspended (pas en pending).
  // pending → pending tant qu'aucune validation initiale n'a eu lieu.
  if (currentStatus === 'verified' || currentStatus === 'suspended') {
    return 'suspended';
  }

  return 'pending';
}
