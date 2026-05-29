// T112 — BriefDeletedNotice (Server Component).
// Page neutre post-effacement (FR-023) : aucune exposition PII.

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export function BriefDeletedNotice(): ReactNode {
  const t = useTranslations('intake.erase');
  return (
    <article className="mx-auto max-w-2xl space-y-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">{t('successMessage')}</h1>
      <p className="text-sm text-muted-foreground">
        Vos données ont été effacées de nos serveurs au Canada. Conformément à la Loi 25, seul un
        identifiant anonymisé est conservé à des fins d'audit.
      </p>
    </article>
  );
}
