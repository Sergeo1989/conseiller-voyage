// Layout des pages MFA (privées, derrière authentification).
// noindex obligatoire — ces pages ne doivent JAMAIS apparaître dans
// l'index public (Principe XII : noindex sur pages privées).

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default function MfaLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-12">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Conseiller Voyage — Sécurité</h1>
      </header>
      <main>{children}</main>
    </div>
  );
}
