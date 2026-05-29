// T073b (H4, M7) — Page publique /voyage/lien-expire.
// Server Component MINCE → MagicLinkExpiredNotice via barrel
// `@/features/intake`. Pas d'indexation SEO (page d'erreur).

import { MagicLinkExpiredNotice } from '@/features/intake';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

interface PageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'intake.linkExpired' });
  return {
    title: `${t('title')} | Conseiller Voyage`,
    description: t('subtitle'),
    robots: { index: false, follow: false },
  };
}

export default function LienExpirePage(): ReactNode {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <MagicLinkExpiredNotice />
    </main>
  );
}
