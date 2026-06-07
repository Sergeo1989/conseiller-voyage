// Page d'accueil publique différenciante (feature 013 / roadmap 026).
//
// US1 (héro) + US2 (sections différenciation/confiance) + US3 (métadonnées,
// JSON-LD Organization/WebSite + FAQPage, génération statique).
//
// Route MINCE (Principe VIII.a) : RSC statique, zéro logique métier, zéro fetch.
// `force-static` garantit l'absence de rendu dynamique par requête → page
// entièrement cacheable au CDN (FR-017/018, échelle « plusieurs M visites/jour »).
// generateStaticParams est fourni par le layout. Le pied de page vient du layout.

import {
  BandeauLoi25,
  CtaDecrireVoyage,
  Hero,
  MentionPasDeContact,
  SectionAvantageConseiller,
  SectionCommentCaMarche,
  SectionFaq,
  SectionNeutralite,
  SectionPourquoiTrois,
  SectionThematiquesTeaser,
  TrustBannerOpcTico,
  buildFaqJsonLd,
  buildHomepageJsonLd,
} from '@/features/home';
import { type Locale, toUrlLocale } from '@/i18n';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

// Rendu entièrement statique : aucune fonction dynamique par requête sur la route.
export const dynamic = 'force-static';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const urlLocale = toUrlLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home.meta' });
  const url = `/${urlLocale}`;

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: url,
      languages: { 'fr-CA': '/fr', en: '/en', 'x-default': '/fr' },
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url,
      siteName: 'Conseiller Voyage',
      locale: locale === 'en' ? 'en_CA' : 'fr_CA',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('title'),
      description: t('description'),
    },
    robots: { index: true, follow: true },
  };
}

export default async function HomePage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const urlLocale = toUrlLocale(locale);
  const t = await getTranslations({ locale, namespace: 'home' });

  const steps = t.raw('commentCaMarche.steps') as ReadonlyArray<{ title: string; body: string }>;
  const themes = t.raw('thematiques.items') as readonly string[];
  const faqItems = t.raw('faq.items') as ReadonlyArray<{ question: string; answer: string }>;
  const avantagePoints = t.raw('avantageConseiller.points') as ReadonlyArray<{
    title: string;
    body: string;
  }>;

  const orgJsonLd = buildHomepageJsonLd(urlLocale, SITE_URL);
  const faqJsonLd = buildFaqJsonLd(faqItems);

  return (
    <main className="min-h-screen bg-white">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD construit à partir de copie i18n maîtrisée (pas d'entrée utilisateur). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: idem — FAQPage depuis i18n. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

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

      <SectionCommentCaMarche heading={t('commentCaMarche.heading')} steps={steps} />

      <SectionAvantageConseiller
        heading={t('avantageConseiller.heading')}
        intro={t('avantageConseiller.intro')}
        points={avantagePoints}
      />

      <TrustBannerOpcTico
        label={t('trust.opcTicoBanner')}
        linkLabel={t('ctaSecondary')}
        urlLocale={urlLocale}
      />

      <SectionPourquoiTrois
        heading={t('pourquoiTrois.heading')}
        body={t('pourquoiTrois.body')}
        note={t('pourquoiTrois.note')}
      />

      <SectionNeutralite heading={t('neutralite.heading')} body={t('neutralite.body')} />

      <SectionThematiquesTeaser
        heading={t('thematiques.heading')}
        items={themes}
        urlLocale={urlLocale}
      />

      <SectionFaq heading={t('faq.heading')} items={faqItems} />

      <BandeauLoi25 heading={t('loi25.heading')} body={t('loi25.body')} />

      <MentionPasDeContact
        heading={t('pasDeContact.heading')}
        body={t('pasDeContact.body')}
        linkLabel={t('pasDeContact.linkLabel')}
        urlLocale={urlLocale}
      />

      <div className="flex justify-center px-4 pb-20">
        <CtaDecrireVoyage urlLocale={urlLocale} label={t('ctaPrimary')} />
      </div>
    </main>
  );
}
