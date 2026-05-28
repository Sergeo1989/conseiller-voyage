// T011 — Type Result<T, E> (discriminated union) + helpers ok/err.
//
// Convention de retour pour les use cases métier de la feature 007 (profil
// conseiller). Les use cases NE jettent PAS d'exception pour les erreurs
// métier (cf. plan.md Constitution Check Principe VIII + profil-edition.port.md
// section "Convention de retour : Result<T, E>") — ils retournent un Result.
//
// Les exceptions restent réservées aux erreurs TECHNIQUES (DB HS, S3 HS,
// programmer error). La distinction est : si le caller peut/doit gérer le
// cas avec une logique métier (afficher un message FR-CA à l'utilisateur,
// re-router, etc.) → Result. Si le cas est imprévu (panne) → exception.
//
// Bénéfices :
//   - Exhaustivité TypeScript : `if (!r.ok)` rend `r.error` typé strict (E),
//     `if (r.ok)` rend `r.value` typé strict (T).
//   - Mapping HTTP propre dans les controllers : `switch (r.error.kind)`
//     exhaustif → status code + body adapté (cf. contracts/http-endpoints.md).
//   - Pas de try/catch métier qui mélange erreurs techniques et erreurs
//     attendues.

/**
 * Discriminated union typant le résultat d'un use case métier.
 *
 * @typeParam T - Type de la valeur retournée en cas de succès.
 * @typeParam E - Type (ou union de types) de l'erreur métier.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Construit un succès. Le caller obtient `r.ok === true` et `r.value` typé `T`.
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Construit un échec métier. Le caller obtient `r.ok === false` et `r.error`
 * typé strictement `E` (utiliser une discriminated union `{ kind: '...' }` pour
 * permettre un `switch` exhaustif côté caller).
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
