// Port OutboxWriter (B1 du review — pattern outbox transactionnel).
// Les use cases écrivent les événements de domaine ici, dans la même
// transaction que la mutation métier. Le OutboxPublisherJob (T066) lit
// ensuite et publie via ConformiteEventPublisher.
// Cf. research.md R7.

export interface OutboxEntryToCreate {
  /** Identifiant unique de l'événement (UUID v4). Sert d'idempotence côté consommateur. */
  readonly id: string;
  /** Ex: `conformite.status.changed`, `conformite.dossier.submitted`. */
  readonly eventType: string;
  /** Payload sérialisable JSON. Pseudonymisation côté audit ne s'applique pas
   *  ici (les événements vont aux consommateurs internes, pas au journal 7 ans). */
  readonly payload: Record<string, unknown>;
}

export interface OutboxWriter {
  /** Append une entrée. Doit s'exécuter dans la même transaction Prisma
   *  que la mutation métier qui l'a déclenchée — d'où l'absence de méthode
   *  `transaction` dédiée : c'est l'adapter Prisma qui orchestre. */
  write(entry: OutboxEntryToCreate): Promise<void>;
}

export const OUTBOX_WRITER = Symbol.for('OutboxWriter');
