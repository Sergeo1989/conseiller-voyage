// Port DisposableEmailChecker — détection d'emails jetables (FR-021).
// L'adapter (T052, T097) charge la liste depuis Redis avec fallback
// snapshot statique embedded.

export interface DisposableEmailChecker {
  /** Retourne true si le domaine est dans la blocklist. Case-insensitive. */
  isDisposable(email: string): Promise<boolean>;
}

export const DISPOSABLE_EMAIL_CHECKER = Symbol.for('DisposableEmailChecker');
