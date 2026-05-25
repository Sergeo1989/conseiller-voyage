// T028 — Port Clock pour la testabilité des fonctions pures (Principe VI).
// Les use cases qui doivent connaître l'heure courante (job d'expiration,
// timestamp d'audit, etc.) dépendent de Clock et reçoivent une horloge
// injectée. Les tests Vitest utilisent un FakeClock pour avancer le temps
// de façon déterministe.

export interface Clock {
  /** Date courante. À ne pas confondre avec `new Date()` non-testable. */
  now(): Date;
  /** Timestamp Unix en millisecondes. */
  nowMs(): number;
}

export const CLOCK = Symbol.for('Clock');
