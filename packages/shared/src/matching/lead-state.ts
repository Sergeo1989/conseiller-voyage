// T001 — Machine d'état du lead (feature 012) : enums + schemas Zod partagés.
//
// Source de vérité des valeurs d'enum pour :
//   - le domaine (`apply-lead-transition.ts`, value object LeadState)
//   - Prisma (`packages/db/prisma/schema/matching.prisma` — enums DB alignés)
//   - les contrats HTTP / port public (`lead-query.port.ts`)
//
// Convention : valeurs **ASCII snake_case** partout dans le code et la DB
// (`envoye`, `devis_envoye`, `reservation_confirmee`). Les libellés accentués
// FR-CA (`envoyé`, `réservation confirmée`) vivent uniquement dans la copie
// d'affichage (i18n `matching.lead.*`) — jamais dans les valeurs persistées.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// LeadState — états de la machine (data-model §LeadState)
// ---------------------------------------------------------------------------

export const LEAD_STATES = [
  'envoye',
  'vu',
  'accepte',
  'refuse',
  'devis_envoye',
  'reservation_confirmee',
  'perdu',
] as const;

export type LeadState = (typeof LEAD_STATES)[number];

export const LeadStateSchema = z.enum(LEAD_STATES);

/** États terminaux : aucune transition sortante autorisée. */
export const TERMINAL_LEAD_STATES = ['refuse', 'reservation_confirmee', 'perdu'] as const;

export type TerminalLeadState = (typeof TERMINAL_LEAD_STATES)[number];

export function isTerminalLeadState(state: LeadState): state is TerminalLeadState {
  return (TERMINAL_LEAD_STATES as readonly string[]).includes(state);
}

// ---------------------------------------------------------------------------
// LeadAction — déclencheurs de transition (data-model §LeadAction)
// ---------------------------------------------------------------------------

export const LEAD_ACTIONS = [
  'marquer_vu', // auto à la 1re consultation (FR-019) ou système
  'accepter',
  'refuser',
  'marquer_devis_envoye',
  'marquer_reservation_confirmee',
  'marquer_perdu',
  'clore_systeme', // re-match / all_matches_revoked (acteur = systeme)
] as const;

export type LeadAction = (typeof LEAD_ACTIONS)[number];

export const LeadActionSchema = z.enum(LEAD_ACTIONS);

// ---------------------------------------------------------------------------
// LeadTransitionActor — qui a initié la transition
// ---------------------------------------------------------------------------

export const LEAD_TRANSITION_ACTORS = ['conseiller', 'systeme'] as const;

export type LeadTransitionActor = (typeof LEAD_TRANSITION_ACTORS)[number];

export const LeadTransitionActorSchema = z.enum(LEAD_TRANSITION_ACTORS);

// ---------------------------------------------------------------------------
// LeadNotificationStatus — acheminement de la notification conseiller
// ---------------------------------------------------------------------------

export const LEAD_NOTIFICATION_STATUSES = [
  'pending',
  'sent',
  'failed',
  'skipped_unverified',
] as const;

export type LeadNotificationStatus = (typeof LEAD_NOTIFICATION_STATUSES)[number];

export const LeadNotificationStatusSchema = z.enum(LEAD_NOTIFICATION_STATUSES);

// ---------------------------------------------------------------------------
// Motifs système de clôture automatique (closeReason)
// ---------------------------------------------------------------------------

export const LEAD_SYSTEM_CLOSE_REASONS = ['re-matched', 'all_matches_revoked'] as const;

export type LeadSystemCloseReason = (typeof LEAD_SYSTEM_CLOSE_REASONS)[number];
