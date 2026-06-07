// T019 [TDD GREEN] — Value Object LeadState (domaine feature 012).
//
// Réutilise l'enum partagé `@cv/shared/matching` (source de vérité alignée
// Prisma) et ajoute les guards/parsing du domaine. Pur, zéro framework.

import { LEAD_STATES, type LeadState, isTerminalLeadState } from '@cv/shared/matching';

export type { LeadState };

export class InvalidLeadStateError extends Error {
  constructor(value: string) {
    super(`État de lead invalide : "${value}"`);
    this.name = 'InvalidLeadStateError';
  }
}

/** Parse strict d'un littéral en LeadState (lève si inconnu). */
export function parseLeadState(value: string): LeadState {
  if ((LEAD_STATES as readonly string[]).includes(value)) {
    return value as LeadState;
  }
  throw new InvalidLeadStateError(value);
}

/** Vrai si l'état est terminal (aucune transition sortante). */
export function isTerminal(state: LeadState): boolean {
  return isTerminalLeadState(state);
}
