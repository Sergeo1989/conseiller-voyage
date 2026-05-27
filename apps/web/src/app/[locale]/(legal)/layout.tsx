// Layout partagé du segment (legal)/ — applique une typographie article
// lisible (max-width 760px, line-height généreux) au-dessus des 5 pages
// publiques mentions-legales, cgu-voyageur, cgu-conseiller, confidentialite,
// comment-ca-marche.
//
// Le layout racine [locale]/layout.tsx fournit déjà la baseline a11y
// (font-size ≥ 16px, focus-visible, touch ≥ 44px). Ce layout n'ajoute
// que le styling spécifique aux articles légaux.

import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }): ReactNode {
  return children;
}
