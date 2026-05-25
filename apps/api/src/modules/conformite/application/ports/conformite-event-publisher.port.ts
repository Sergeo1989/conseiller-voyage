// Port ConformiteEventPublisher — publication effective des événements
// du domaine vers les consommateurs internes (matching, SEO, identité).
//
// CE PORT N'EST PAS CONSOMMÉ PAR LES USE CASES. Les use cases écrivent
// dans le port OutboxWriter (pattern outbox transactionnel B1 — R7).
// C'est OutboxPublisherJob (T066, Phase 3C) qui consomme ce port pour
// publier les événements stockés dans la table outbox.
//
// Implémentations :
//   - RedisConformiteEventPublisher (T096) — pub/sub Redis
//   - InProcessConformiteEventPublisher (test) — appel direct des handlers

import type {
  ConformiteStatusChangedEvent,
  DossierDecidedEvent,
  DossierSubmittedEvent,
} from '../../domain/events';

export type ConformiteDomainEvent =
  | ConformiteStatusChangedEvent
  | DossierSubmittedEvent
  | DossierDecidedEvent;

export type EventHandler = (event: ConformiteDomainEvent) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface ConformiteEventPublisher {
  publish(event: ConformiteDomainEvent): Promise<void>;
  subscribe(handler: EventHandler): Unsubscribe;
}

export const CONFORMITE_EVENT_PUBLISHER = Symbol.for('ConformiteEventPublisher');
