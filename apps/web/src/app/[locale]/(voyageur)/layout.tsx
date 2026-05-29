// T087 — Layout du route group (voyageur)/ — sessions privées
// authentifiées par cookie magic link. Robots noindex (pages personnelles,
// pas de valeur SEO ; cf. spec.md FR-014a).

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  // Title par défaut hérité par toutes les pages (voyageur) qui ne déclarent
  // pas leur propre `metadata.title`. WCAG 2.4.2 — un <title> non vide DOIT
  // exister sur chaque document.
  title: {
    default: 'Mon brief de voyage — Conseiller Voyage',
    template: '%s — Conseiller Voyage',
  },
  robots: { index: false, follow: false },
};

export default function VoyageurLayout({ children }: { children: ReactNode }): ReactNode {
  return <>{children}</>;
}
