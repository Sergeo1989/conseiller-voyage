// Helpers pour la création / suppression du cookie de session Auth.js
// après login ou accept-invitation. Centralisés ici pour éviter la
// duplication entre `login.action.ts`, `accept-admin-invitation.action.ts`
// et `logout.action.ts`.
//
// Le cookie en prod (`__Host-cv.session.token`) exige HTTPS — pour le
// dev HTTP on retombe sur le nom Auth.js standard sans préfixe.

import { randomBytes } from 'node:crypto';
import { prisma } from '@cv/db';
import { cookies } from 'next/headers';

export const SESSION_TTL_DAYS = 30;
export const SESSION_COOKIE_NAME_DEV = 'authjs.session-token';
export const SESSION_COOKIE_NAME_PROD = '__Host-cv.session.token';

export function getSessionCookieName(): string {
  return process.env.NODE_ENV === 'production' ? SESSION_COOKIE_NAME_PROD : SESSION_COOKIE_NAME_DEV;
}

/** Crée une session DB + pose le cookie. Renvoie le token brut. */
export async function createSessionAndSetCookie(userId: string): Promise<string> {
  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.authSession.create({
    data: { sessionToken, userId, expires },
  });

  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });

  return sessionToken;
}

/** Supprime la session DB (si présente) et clear le cookie. */
export async function destroySessionAndClearCookie(): Promise<void> {
  const cookieStore = await cookies();
  const tokenProd = cookieStore.get(SESSION_COOKIE_NAME_PROD)?.value;
  const tokenDev = cookieStore.get(SESSION_COOKIE_NAME_DEV)?.value;
  const token = tokenProd ?? tokenDev;
  if (!token) return;

  await prisma.authSession.deleteMany({ where: { sessionToken: token } });
  if (tokenProd) cookieStore.delete(SESSION_COOKIE_NAME_PROD);
  if (tokenDev) cookieStore.delete(SESSION_COOKIE_NAME_DEV);
}
