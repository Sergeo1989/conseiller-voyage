// T093 — Port MatchingEventPublisher (publication des events outbox vers le bus).
//
// CE PORT N'EST PAS CONSOMMÉ PAR LES USE CASES. Les use cases écrivent dans
// `matching_outbox_entries` via MatchingOutboxWriter (outbox transactionnel).
// C'est `MatchingOutboxPublisherJob` qui draine la table et consomme ce port
// pour publier sur le bus interne — consommable par 012 (notifications + lead
// state machine) et l'extension US5 admin de 008.
//
// Pattern hérité de `ConformiteEventPublisher` (feature 001/003). Extension
// cross-module Mode B (ADR-0024 §E3) — livrée en PR satellite.

import type { MatchingEventBusName } from '@cv/shared/matching';

/** Événement matching publié sur le bus (nom kebab-case + payload + clé idempotence). */
export interface MatchingBusEvent {
  /** Nom event bus kebab-case (ex. `voyageur.brief.matched`). */
  readonly name: MatchingEventBusName;
  /** Payload JSON tel que stocké dans `matching_outbox_entries.payload`. */
  readonly payload: unknown;
  /** Clé d'idempotence (propagée aux consommateurs pour dédup at-least-once). */
  readonly idempotencyKey: string;
}

export interface MatchingEventPublisher {
  publish(event: MatchingBusEvent): Promise<void>;
}

export const MATCHING_EVENT_PUBLISHER = Symbol.for('MatchingEventPublisher');
