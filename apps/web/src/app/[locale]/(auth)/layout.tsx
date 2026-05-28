// Layout des routes authentifiées (groupe (auth)) — couvre les pages
// /admin/* (RBAC), /mfa/*, /parametres/*, /connexion, etc. Pose un titre
// par défaut pour satisfaire WCAG 2.4.2 (Page Titled — Principe XI), que
// chaque page peut overrider via son propre `metadata.title` (Next.js
// merge automatiquement).
//
// noindex par défaut : les routes sous (auth) sont privées, jamais
// indexables (Principe XII).

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Conseiller Voyage',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default function AuthLayout({ children }: { children: ReactNode }): ReactNode {
  return <>{children}</>;
}
