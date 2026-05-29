// T073 (M7) — Page publique /voyage/email-envoye.
// Server Component MINCE → EmailSentNotice via barrel `@/features/intake`.
// L'email est passé en query string par BriefFormWizard après submit
// réussi.

import { EmailSentNotice } from '@/features/intake';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

interface PageProps {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ email?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'intake.emailSent' });
  return {
    title: `${t('title')} | Conseiller Voyage`,
    description: t('delayHint'),
    robots: { index: false, follow: false },
  };
}

export default async function EmailEnvoyePage({ searchParams }: PageProps): Promise<ReactNode> {
  const { email } = await searchParams;
  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <EmailSentNotice email={email ?? ''} />
    </main>
  );
}
