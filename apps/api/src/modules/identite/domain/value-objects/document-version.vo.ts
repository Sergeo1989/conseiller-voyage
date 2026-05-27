// Value object DocumentVersion (T029) — entier positif monotone, avec
// méthode de comparaison sémantique.
// Cf. specs/004-mentions-legales/data-model.md *Value Objects*.

/**
 * Construit une DocumentVersion validée. Lance une exception si la
 * valeur n'est pas un entier positif strict.
 *
 * Pattern factory function plutôt que classe : cohérent avec le style
 * value-objects de 001 (cf. conformite-status.vo.ts) et plus léger pour
 * un simple wrapper d'entier.
 */
export function asDocumentVersion(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error(`DocumentVersion must be an integer, got ${value}`);
  }
  if (value <= 0) {
    throw new Error(`DocumentVersion must be > 0, got ${value}`);
  }
  return value;
}

/**
 * Compare strictement deux versions. Retourne true si `a > b`.
 */
export function isStrictlyGreater(a: number, b: number): boolean {
  return asDocumentVersion(a) > asDocumentVersion(b);
}
