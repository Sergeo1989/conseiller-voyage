// Page d'accueil publique différenciante (feature 013 / roadmap 026).
//
// Remplace le squelette de soft-launch par la page de positionnement voyageur.
// MVP US1 : héro (promesse + CTA unique vers l'intake + « gratuit, sans
// engagement » + micro-confiance OPC/TICO). Les sections de différenciation
// (US2) et le balisage SEO/JSON-LD + cacheabilité (US3) arrivent ensuite.
//
// Route MINCE (Principe VIII.a) : RSC, zéro logique métier, zéro fetch. Toute
// la présentation vit dans le slice `features/home`. Accès conseiller conservé
// en lien secondaire discret (FR-015) — sans concurrencer le CTA voyageur.

import { Hero } from '@/features/home';
import { type Locale, toUrlLocale } from '@/i18n';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function HomePage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const urlLocale = toUrlLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home' });

  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-end px-4 py-4">
        <Link
          href={`/${urlLocale}/conseiller/conformite`}
          className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {t('advisorAccess')}
        </Link>
      </header>

      <Hero
        urlLocale={urlLocale}
        title={t('hero.title')}
        subtitle={t('hero.subtitle')}
        ctaLabel={t('ctaPrimary')}
        freeLabel={t('trust.freeForTravelers')}
        trustLabel={t('trust.opcTicoBanner')}
      />
    </main>
  );
}
