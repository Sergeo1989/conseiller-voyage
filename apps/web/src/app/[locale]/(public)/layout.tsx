// Layout du groupe (public)/ — pages publiques indexables SEO (profil
// public conseiller, page «Comment ça marche»). Pas de noindex —
// l'indexation et l'optimisation SEO sont la valeur cœur (Principe XII).

import type { ReactNode } from 'react';

export default function PublicLayout({ children }: { children: ReactNode }): ReactNode {
  return <>{children}</>;
}
