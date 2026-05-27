// T028 — Circuit breaker state machine au-dessus du SDK AWS SES.
//
// État `closed` (normal) → `open` (rejette tout) → `half-open` (essai)
// → `closed` ou `open` selon résultat.
//
// Seuils (research R7) :
//   - Ouverture après 5 échecs successifs en 60 s.
//   - Reste ouvert 30 s.
//   - Demi-ouverture autorise 1 essai test.
//   - 1 succès en half-open → fermeture.
//   - 1 échec en half-open → réouverture immédiate.
//
// Fonction pure : prend l'état actuel + l'événement (échec/succès) +
// l'instant courant, retourne le nouvel état.

export type CircuitState =
  | { kind: 'closed'; failuresInWindow: ReadonlyArray<Date> }
  | { kind: 'open'; openedAt: Date }
  | { kind: 'half-open' };

export type CircuitEvent = { type: 'failure' } | { type: 'success' };

const OPEN_AFTER_FAILURES = 5;
const FAILURE_WINDOW_MS = 60_000;
const OPEN_DURATION_MS = 30_000;

export const INITIAL_CIRCUIT_STATE: CircuitState = {
  kind: 'closed',
  failuresInWindow: [],
};

function closedClosed(failures: ReadonlyArray<Date>): CircuitState {
  return { kind: 'closed', failuresInWindow: failures };
}

function transitionFromClosed(
  current: { kind: 'closed'; failuresInWindow: ReadonlyArray<Date> },
  event: CircuitEvent,
  now: Date,
): CircuitState {
  if (event.type === 'success') {
    return closedClosed([]);
  }
  const filtered = current.failuresInWindow.filter(
    (d) => now.getTime() - d.getTime() <= FAILURE_WINDOW_MS,
  );
  const newFailures = [...filtered, now];
  if (newFailures.length >= OPEN_AFTER_FAILURES) {
    return { kind: 'open', openedAt: now };
  }
  return closedClosed(newFailures);
}

function transitionFromOpen(
  current: { kind: 'open'; openedAt: Date },
  event: CircuitEvent,
  now: Date,
): CircuitState {
  const isOpenExpired = now.getTime() - current.openedAt.getTime() >= OPEN_DURATION_MS;
  if (!isOpenExpired) {
    return current;
  }
  // Half-open implicite — l'événement courant est le test.
  if (event.type === 'success') {
    return closedClosed([]);
  }
  return { kind: 'open', openedAt: now };
}

function transitionFromHalfOpen(event: CircuitEvent, now: Date): CircuitState {
  if (event.type === 'success') {
    return closedClosed([]);
  }
  return { kind: 'open', openedAt: now };
}

/**
 * Calcule le nouvel état du circuit après un événement.
 */
export function computeCircuitState(
  current: CircuitState,
  event: CircuitEvent,
  now: Date,
): CircuitState {
  if (current.kind === 'closed') {
    return transitionFromClosed(current, event, now);
  }
  if (current.kind === 'open') {
    return transitionFromOpen(current, event, now);
  }
  return transitionFromHalfOpen(event, now);
}

/**
 * Le circuit autorise-t-il un appel ? `open` interdit, `closed` et
 * `half-open` autorisent. `half-open` n'autorise qu'UN appel à la fois
 * — cette logique vit côté caller (gate par lock applicatif).
 */
export function isCallAllowed(state: CircuitState, now: Date): boolean {
  if (state.kind === 'closed') return true;
  if (state.kind === 'half-open') return true;
  // open : vérifie si on est passé en half-open implicitement
  return now.getTime() - state.openedAt.getTime() >= OPEN_DURATION_MS;
}
