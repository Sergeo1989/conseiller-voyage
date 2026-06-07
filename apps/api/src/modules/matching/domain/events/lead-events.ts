// T021 [GREEN] — Types d'événements domain lead (feature 012).
//
// Émis par les use cases (ConsumeMatchingEvent, RecordLeadTransition) pour
// l'observabilité / metrics (R9). La communication VOYAGEUR est hors périmètre
// (FR-017) — aucun événement voyageur n'est publié par 012.

import type { LeadAction, LeadId, LeadState, LeadTransitionActor } from '@cv/shared/matching';

export interface LeadCreatedEvent {
  readonly type: 'lead.created';
  readonly leadId: LeadId;
  readonly matchingResultId: string;
  readonly conseillerId: string;
  readonly briefId: string | null;
  readonly occurredAt: Date;
}

export interface LeadNotificationRequestedEvent {
  readonly type: 'lead.notification_requested';
  readonly leadId: LeadId;
  readonly conseillerId: string;
  readonly idempotencyKey: string;
  readonly occurredAt: Date;
}

export interface LeadTransitionedEvent {
  readonly type: 'lead.transitioned';
  readonly leadId: LeadId;
  readonly fromState: LeadState | null;
  readonly toState: LeadState;
  readonly action: LeadAction;
  readonly actor: LeadTransitionActor;
  readonly occurredAt: Date;
}

export type LeadDomainEvent =
  | LeadCreatedEvent
  | LeadNotificationRequestedEvent
  | LeadTransitionedEvent;
