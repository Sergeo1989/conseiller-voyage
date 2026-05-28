// Helpers partagés par les Server Actions profil-conseiller. Évite la
// duplication de getSessionCookieHeader / hasCode dans 4 fichiers d'actions.

import { cookies } from 'next/headers';

export const PROFIL_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const SESSION_COOKIE_NAME_DEV = 'authjs.session-token';
const SESSION_COOKIE_NAME_PROD = '__Host-cv.session.token';

/** Récupère le cookie de session sous la forme attendue par fetch — null si absent. */
export async function getSessionCookieHeader(): Promise<string | null> {
  const store = await cookies();
  const isProd = process.env.NODE_ENV === 'production';
  const cookieName = isProd ? SESSION_COOKIE_NAME_PROD : SESSION_COOKIE_NAME_DEV;
  const value = store.get(cookieName)?.value;
  if (!value) return null;
  return `${cookieName}=${value}`;
}

/** Vérifie qu'un objet contient un champ `code` égal à la valeur attendue. */
export function hasCode(data: unknown, code: string): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'code' in data &&
    (data as { code: unknown }).code === code
  );
}
