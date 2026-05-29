// T115h — Page /voyage/mes-donnees/effacee — confirmation post-effacement global.
// Pas d'exposition PII (FR-023).

import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

interface PageProps {
  readonly params: Promise<{ locale: string }>;
}

export default async function EffaceePage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'intake.eraseAll' });
  return (
    <main className="container mx-auto max-w-2xl space-y-4 px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">{t('successMessage')}</h1>
      <p className="text-sm text-muted-foreground">
        Vos données ont été effacées au Canada conformément à la Loi 25.
      </p>
    </main>
  );
}
