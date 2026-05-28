// Layout du groupe (admin)/ — console d'administration (modération
// profils, conformité, utilisateurs). Auth requise + rôle admin
// (vérifié au niveau use case / Server Action, Principe IX). Pages
// noindex car privées (Principe XII).

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: {
    default: 'Conseiller Voyage — Admin',
    template: '%s — Conseiller Voyage Admin',
  },
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default function AdminLayout({ children }: { children: ReactNode }): ReactNode {
  return <>{children}</>;
}
