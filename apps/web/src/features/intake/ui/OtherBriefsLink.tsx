// T086 — OtherBriefsLink.
// FR-017 : lien "Voir mes autres briefs" depuis la page récap.

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface OtherBriefsLinkProps {
  readonly locale: 'fr' | 'en';
}

export function OtherBriefsLink({ locale }: OtherBriefsLinkProps): ReactNode {
  const t = useTranslations('intake.recap');
  return (
    <Link
      href={`/${locale}/voyage/mes-briefs`}
      className="text-sm font-medium text-primary underline decoration-1 underline-offset-2 hover:text-primary/80"
    >
      {t('otherBriefsLink')}
    </Link>
  );
}
