// Helper RSC — exige une session admin, redirige sinon.
//
// Sémantique RBAC (Principe IX) :
//   - pas de session             → /login
//   - session conseiller/voyageur → / (non-énumération, cf. require-conseiller)
//
// Utilisé par `(admin)/layout.tsx` et les Server Actions de modération.

import type { CvSession } from '@/auth';
import { toUrlLocale } from '@/i18n';
import { redirect } from 'next/navigation';
import { type RequireSessionOptions, requireSession } from './require-session';

export async function requireAdmin(options: RequireSessionOptions = {}): Promise<CvSession> {
  const session = await requireSession(options);
  if (session.user.role === 'admin') return session;

  const localePrefix = options.locale ? `/${toUrlLocale(options.locale)}` : '';
  redirect(`${localePrefix}/`);
}
