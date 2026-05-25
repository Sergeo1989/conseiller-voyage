// T034 — Value Object ConformiteStatus.
// Machine d'état du statut conformité d'un conseiller.
// Cf. spec FR-007, data-model.md *Entités clés > Statut de conformité*,
// et clarification Q2 (under_review supprimé du MVP).

export const CONFORMITE_STATUSES = ['pending', 'verified', 'suspended', 'revoked'] as const;

export type ConformiteStatus = (typeof CONFORMITE_STATUSES)[number];

/** Vrai uniquement si le statut autorise la visibilité publique et le matching. */
export function isVerifiedStatus(status: ConformiteStatus): boolean {
  return status === 'verified';
}

/** Vrai si l'état est final et ne peut pas évoluer automatiquement. */
export function isFinalStatus(status: ConformiteStatus): boolean {
  return status === 'revoked';
}

/** Vrai si la transition vers ce statut est « négative » au sens de FR-022
 *  (exposition réglementaire — propagation < 10 s exigée). */
export function isNegativeStatus(status: ConformiteStatus): boolean {
  return status === 'suspended' || status === 'revoked';
}
