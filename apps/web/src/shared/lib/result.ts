// Discriminated union pour le retour des Server Actions (Principe VIII.a §3).
//
// Règle : une Server Action NE DOIT JAMAIS `throw` pour un échec métier
// prévu. Elle retourne toujours un ActionResult<T> que le Client Component
// peut typer et router (UI d'erreur, toast, redirect, etc.).
//
// Réserver `throw` aux invariants violés et aux erreurs d'infrastructure
// (réseau, DB indisponible), qui seront capturées par error boundaries +
// Sentry.

export type ActionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ActionError };

export interface ActionError {
  readonly code: string;
  readonly message: string;
  /** Pour les erreurs de validation : champ du formulaire concerné. */
  readonly field?: string;
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function err(code: string, message: string, field?: string): ActionResult<never> {
  return { ok: false, error: { code, message, ...(field !== undefined && { field }) } };
}
