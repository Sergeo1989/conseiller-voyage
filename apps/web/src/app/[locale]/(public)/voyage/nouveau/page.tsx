// T072 (M7) — Page publique /voyage/nouveau.
// Server Component MINCE → BriefFormWizard (import via barrel
// `@/features/intake`, Principe VIII.a §6).
// SEO indexable (T074 : layout (public) ne pose pas noindex).

import { BriefFormWizard } from '@/features/intake';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

interface PageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'intake.form' });
  return {
    title: `${t('title')} | Conseiller Voyage`,
    description: t('subtitle'),
    alternates: {
      languages: {
        'fr-CA': '/fr/voyage/nouveau',
        en: '/en/voyage/nouveau',
      },
    },
  };
}

export default async function NouveauBriefPage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const localeForServerAction: 'fr-CA' | 'en' = locale === 'en' ? 'en' : 'fr-CA';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Décrivez votre projet de voyage',
    inLanguage: localeForServerAction,
  };

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD literal sécurisé (pas d'input utilisateur)
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BriefFormWizard localeForServerAction={localeForServerAction} />
    </main>
  );
}
