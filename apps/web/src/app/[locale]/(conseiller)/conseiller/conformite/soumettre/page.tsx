// T076 — Page "Soumettre mon dossier de conformité".
// Server Component qui vérifie l'auth puis monte le client SubmitDossierForm.

import { auth } from '@/auth';
import { SubmitDossierForm } from '@/features/conformite/ui/SubmitDossierForm';
import { type Locale, toUrlLocale } from '@/i18n';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function SubmitDossierPage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const urlLocale = toUrlLocale(locale);
  const session = await auth();
  if (!session?.user) {
    redirect(`/${urlLocale}/login?callbackUrl=/${urlLocale}/conseiller/conformite/soumettre`);
  }

  const t = await getTranslations({ locale, namespace: 'conformite.conseiller.submit' });

  return (
    <main
      style={{
        maxWidth: 800,
        margin: '32px auto',
        padding: '0 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <h1>{t('title')}</h1>
      <p style={{ color: '#6b7280' }}>{t('intro')}</p>
      <SubmitDossierForm />
    </main>
  );
}
