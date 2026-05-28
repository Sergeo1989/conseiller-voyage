// Helpers RSC pour la gestion de session côté `apps/web`.
// Convention Principe VIII.a §7 (autorisation graduée) :
//   - middleware.ts        → coarse-grained (session + CGU)
//   - shared/auth/require-* → fine-grained par rôle, dans les layouts/actions
//   - cas d'usage           → propriété de ressource
//   - DB (filtre verified)  → garde-fou ultime (Principe I)

export { getSession } from './get-session';
export { requireSession } from './require-session';
export type { RequireSessionOptions } from './require-session';
export { requireConseiller } from './require-conseiller';
export { requireAdmin } from './require-admin';
