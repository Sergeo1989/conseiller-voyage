// Helper RSC pour lire la session courante.
// Wrapper léger autour de `auth()` pour homogénéiser les imports depuis
// `@/shared/auth` plutôt que `@/auth` directement (couche d'indirection
// qui permet de basculer vers Auth.js v5 sans toucher les call sites).

import { auth } from '@/auth';
import type { CvSession } from '@/auth';

/**
 * Renvoie la session courante ou `null` si pas de cookie / cookie invalide /
 * session expirée. Pour exiger une session, utiliser `requireSession`.
 */
export async function getSession(): Promise<CvSession | null> {
  return auth();
}
