// T042 — Fonction pure isTransitionAllowed (Principe VI NON-NÉGOCIABLE).
// Implémentée pour faire passer les tests T031 du RED au GREEN.
//
// Source de vérité de la machine d'état :
//   data-model.md *Machine d'état du statut conformité*
//   + spec.md *Entités clés > Statut de conformité du conseiller*
//   + clarification Q2 (under_review supprimé du MVP).
//
// 7 transitions autorisées au total ; toute autre est interdite.

import type { ConformiteStatus } from '../value-objects/conformite-status.vo';

const ALLOWED_TRANSITIONS: ReadonlySet<string> = new Set([
  'pending->pending', // refus admin → conseiller peut re-soumettre
  'pending->verified', // approbation initiale (US1)
  'verified->suspended', // expiration auto OU perte d'affiliation (FR-015)
  'verified->revoked', // révocation admin (US4)
  'suspended->verified', // renouvellement approuvé
  'suspended->revoked', // révocation admin sur conseiller suspendu
  'revoked->pending', // nouvelle soumission complète (US4 acceptance #2)
]);

export function isTransitionAllowed(from: ConformiteStatus, to: ConformiteStatus): boolean {
  return ALLOWED_TRANSITIONS.has(`${from}->${to}`);
}
