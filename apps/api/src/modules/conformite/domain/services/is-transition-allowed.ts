// T042 — STUB pour Phase 3A. Implémentation réelle dans le commit suivant.
// Le throw rend tous les tests T031 RED visible.

import type { ConformiteStatus } from '../value-objects/conformite-status.vo';

export function isTransitionAllowed(_from: ConformiteStatus, _to: ConformiteStatus): boolean {
  throw new Error('isTransitionAllowed not yet implemented (T042 — TDD red).');
}
