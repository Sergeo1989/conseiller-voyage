// Helper RSC — exige une session valide, redirige vers /login sinon.
// Utilisé par les layouts de groupes privés ((conseiller), (admin),
// (auth)/(private)) et par les Server Actions qui exigent une session
// avant tout autre check.

import type { CvSession } from '@/auth';
import { toUrlLocale } from '@/i18n';
import { redirect } from 'next/navigation';
import { getSession } from './get-session';

export interface RequireSessionOptions {
  /** Locale courante (depuis params) — sert à construire le redirect localisé. */
  readonly locale?: string;
  /** Si fourni, redirect vers /login?next=<returnTo>. */
  readonly returnTo?: string;
}

/**
 * Renvoie la session courante ou redirige vers /login si absente.
 * Le contrat de retour est `CvSession` (non-null) : après cet appel, le
 * caller peut accéder à `session.user` sans null-check.
 */
export async function requireSession(options: RequireSessionOptions = {}): Promise<CvSession> {
  const session = await getSession();
  if (session?.user) return session;

  const localePrefix = options.locale ? `/${toUrlLocale(options.locale)}` : '';
  const returnParam = options.returnTo ? `?next=${encodeURIComponent(options.returnTo)}` : '';
  redirect(`${localePrefix}/login${returnParam}`);
}
