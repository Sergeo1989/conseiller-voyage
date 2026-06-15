// T005 [014] — Types de vue + schémas du slice leads (dashboard conseiller).
// Miroir des réponses HTTP de 012 (ConseillerLeadController). Aucune PII de
// contact, aucun champ transactionnel.

import type { LeadState } from '@cv/shared/matching';
import { z } from 'zod';

// `LeadState` est ré-exporté depuis la source de vérité `@cv/shared/matching`
// (et non recopié) pour qu'un ajout d'état déclenche une erreur de compilation
// ici plutôt qu'une dérive silencieuse (cf. WRITABLE_NEXT exhaustif ci-dessous).
export type { LeadState };

export interface LeadBriefSummary {
  readonly destinations: string[];
  readonly periodeApprox: string;
  readonly typeProjet: string;
}

export interface LeadTransitionView {
  readonly fromState: LeadState | null;
  readonly toState: LeadState;
  readonly actor: 'conseiller' | 'systeme';
  readonly occurredAt: string;
}

export interface LeadView {
  readonly id: string;
  readonly matchingResultId: string;
  readonly position: 1 | 2 | 3;
  readonly currentState: LeadState;
  readonly scoreFinal: number | null;
  readonly boosted: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly brief: LeadBriefSummary | null;
  readonly history: ReadonlyArray<LeadTransitionView>;
}

export interface LeadListPage {
  readonly items: ReadonlyArray<LeadView>;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

/** Actions conseiller du cycle de vie (déléguées à 012). */
export type LeadAction = 'accept' | 'refuse' | 'quote-sent' | 'booking-confirmed' | 'lost';

/** Verbe → état cible attendu (mapping UI pur, pour afficher les actions valides). */
export const WRITABLE_NEXT: Record<LeadState, ReadonlyArray<LeadAction>> = {
  envoye: [],
  vu: ['accept', 'refuse'],
  accepte: ['quote-sent', 'lost'],
  devis_envoye: ['booking-confirmed', 'lost'],
  reservation_confirmee: [],
  refuse: [],
  perdu: [],
};

export const reasonSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export const leadIdSchema = z.object({ leadId: z.string().uuid() });
