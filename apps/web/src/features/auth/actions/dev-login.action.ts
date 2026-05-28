// Server Action dev-only — crée une AuthSession et set le cookie.
//
// SÉCURITÉ : refuse en production. La vraie auth (passkey/magic link)
// sera implémentée dans le module identité (feature ultérieure).

'use server';

import { randomBytes } from 'node:crypto';
import { getEnv } from '@/env';
import { toUrlLocale } from '@/i18n';
import { prisma } from '@cv/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const SESSION_TTL_DAYS = 30;
const COOKIE_NAME = 'authjs.session-token'; // HTTP-compatible (vs __Host-* qui exige HTTPS)

export type DevLoginRole = 'conseiller' | 'admin';

export async function devLoginAction(role: DevLoginRole, locale: string): Promise<void> {
  if (getEnv().NODE_ENV === 'production') {
    throw new Error('Dev login disabled in production.');
  }

  const email = role === 'admin' ? 'admin@test.cv' : 'conseiller@test.cv';
  const user = await prisma.authUser.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`Utilisateur dev "${email}" introuvable. Lance d'abord : pnpm db:seed:dev`);
  }

  // Crée une session Auth.js valide (compatible PrismaAuthSessionReader)
  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      sessionToken,
      userId: user.id,
      expires,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // dev HTTP — en prod ce sera true automatiquement avec __Host-
    path: '/',
    expires,
  });

  // Redirige vers l'espace correspondant au rôle
  const urlLocale = toUrlLocale(locale);
  const target =
    role === 'admin' ? `/${urlLocale}/admin/conformite` : `/${urlLocale}/conseiller/conformite`;
  redirect(target);
}

export async function devLogoutAction(locale: string): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await prisma.authSession.deleteMany({ where: { sessionToken: token } });
    cookieStore.delete(COOKIE_NAME);
  }
  redirect(`/${toUrlLocale(locale)}`);
}
