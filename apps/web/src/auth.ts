// T017 — Helper `auth()` côté apps/web.
//
// IMPLÉMENTATION DEV/PHASE 1 — directe via Prisma, SANS Auth.js.
//
// Pourquoi pas @auth/prisma-adapter ?
//   Le PrismaAdapter d'Auth.js v5 exige des modèles nommés
//   `User`/`Session`/`Account`/`VerificationToken`. Notre schéma
//   utilise `AuthUser`/`AuthSession`/`AuthAccount`/`AuthVerificationToken`
//   (préfixe `Auth` pour éviter collision avec les modèles métier
//   conformite/identité). L'adapter cherche `prisma.user` qui est
//   undefined → TypeError au runtime.
//
//   Plutôt que d'écrire un adapter wrapper qui mappe les noms,
//   on lit directement la table `auth_sessions` côté Web. La vraie
//   pile Auth.js (passkey/magic link + custom adapter) sera mise en
//   place en feature 002 (identité).
//
// Côté API NestJS, l'AuthGuard fait déjà exactement le même lookup
// via PrismaAuthSessionReader — donc Web et API sont cohérents.

import { prisma } from '@cv/db';
import { cookies } from 'next/headers';

/**
 * Noms de cookie acceptés :
 * - Prod : UNIQUEMENT `__Host-cv.session.token` (strict HTTPS + path=/).
 * - Dev : on accepte aussi `authjs.session-token` (HTTP-compatible, posé
 *   par devLoginAction). Gating par NODE_ENV pour éviter qu'un sous-
 *   domaine compromis en prod pose un cookie non-`__Host-` qui serait
 *   accepté — vecteur de fixation de session. Documenté par /review.
 */
const SESSION_COOKIE_NAMES =
  process.env.NODE_ENV === 'production'
    ? (['__Host-cv.session.token'] as const)
    : (['__Host-cv.session.token', 'authjs.session-token'] as const);

export type AuthRole = 'voyageur' | 'conseiller' | 'admin';

export interface CvSessionUser {
  readonly id: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly role: AuthRole;
}

export interface CvSession {
  readonly user: CvSessionUser;
  readonly expires: Date;
}

/**
 * Retourne la session courante ou `null` si aucun cookie valide,
 * cookie expiré, ou session introuvable en DB.
 *
 * API compatible avec celle d'Auth.js : `const session = await auth();`
 * `if (!session?.user) redirect('/login');`
 */
export async function auth(): Promise<CvSession | null> {
  const cookieStore = await cookies();

  let token: string | undefined;
  for (const name of SESSION_COOKIE_NAMES) {
    const value = cookieStore.get(name)?.value;
    if (value) {
      token = value;
      break;
    }
  }
  if (!token) return null;

  const session = await prisma.authSession.findUnique({
    where: { sessionToken: token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expires.getTime() <= Date.now()) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role as AuthRole,
    },
    expires: session.expires,
  };
}
