// T015 — Port ConsumedEventStore (dédup at-least-once du bus, feature 012).
//
// Trace les événements bus déjà traités (clé = `idempotencyKey` de
// l'événement). Première barrière d'idempotence (ADR-0026) ; la seconde est la
// contrainte UNIQUE DB sur `leads` / `lead_notification_outbox`.

export interface ConsumedEventStore {
  hasConsumed(idempotencyKey: string): Promise<boolean>;

  /**
   * Enregistre l'événement comme consommé. Idempotent : un enregistrement
   * concurrent du même `idempotencyKey` (PK) ne lève pas — retourne `false`
   * si déjà présent, `true` si nouvellement enregistré.
   */
  recordConsumed(idempotencyKey: string, eventName: string): Promise<boolean>;
}

export const CONSUMED_EVENT_STORE = Symbol.for('ConsumedEventStore');
