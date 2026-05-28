// Layout du groupe (conseiller)/ — espace privé conseiller (dashboard,
// conformité, profil édition). Auth requise + rôle conseiller (vérifié
// au niveau use case / Server Action, Principe IX). Pages noindex car
// privées (Principe XII).

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: {
    default: 'Conseiller Voyage',
    template: '%s — Conseiller Voyage',
  },
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default function ConseillerLayout({ children }: { children: ReactNode }): ReactNode {
  return <>{children}</>;
}
