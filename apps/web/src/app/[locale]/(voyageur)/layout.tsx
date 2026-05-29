// T087 — Layout du route group (voyageur)/ — sessions privées
// authentifiées par cookie magic link. Robots noindex (pages personnelles,
// pas de valeur SEO ; cf. spec.md FR-014a).

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function VoyageurLayout({ children }: { children: ReactNode }): ReactNode {
  return <>{children}</>;
}
