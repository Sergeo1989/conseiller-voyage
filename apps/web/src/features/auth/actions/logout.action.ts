// Server Action — déconnexion (US4).
// Supprime la session DB + clear le cookie. L'endpoint NestJS
// /api/auth/logout reste disponible pour tests et future force-logout admin.

'use server';

import { destroySessionAndClearCookie } from '../lib/session-cookie';

export async function logoutAction(): Promise<void> {
  await destroySessionAndClearCookie();
}
