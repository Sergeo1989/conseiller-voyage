// Helper RSC — exige une session conseiller, redirige sinon.
//
// Sémantique RBAC (Principe IX) :
//   - pas de session         → /login
//   - session admin/voyageur → / (404 implicite, on ne révèle pas que la
//     route existe ; comportement défense-en-profondeur conforme à
//     Principe I sur la non-énumération)
//
// Utilisé par `(conseiller)/layout.tsx` et les Server Actions sensibles
// avant tout call métier.

import type { CvSession } from '@/auth';
import { toUrlLocale } from '@/i18n';
import { redirect } from 'next/navigation';
import { type RequireSessionOptions, requireSession } from './require-session';

export async function requireConseiller(options: RequireSessionOptions = {}): Promise<CvSession> {
  const session = await requireSession(options);
  if (session.user.role === 'conseiller') return session;

  const localePrefix = options.locale ? `/${toUrlLocale(options.locale)}` : '';
  redirect(`${localePrefix}/`);
}
