// Page d'accueil publique différenciante (feature 013 / roadmap 026).
//
// Remplace le squelette de soft-launch par la page de positionnement voyageur.
// US1 (héro) + US2 (sections de différenciation + confiance). Le balisage SEO/
// JSON-LD + cacheabilité (US3) arrive ensuite.
//
// Route MINCE (Principe VIII.a) : RSC, zéro logique métier, zéro fetch. Toute la
// présentation vit dans le slice `features/home` ; cette page ne fait que résoudre
// l'i18n et composer. Le pied de page est fourni par le layout. Accès conseiller
// conservé en lien secondaire discret (FR-015).

import {
  BandeauLoi25,
  CtaDecrireVoyage,
  Hero,
  MentionPasDeContact,
  SectionCommentCaMarche,
  SectionFaq,
  SectionNeutralite,
  SectionPourquoiTrois,
  SectionThematiquesTeaser,
  TrustBannerOpcTico,
} from '@/features/home';
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

  const steps = t.raw('commentCaMarche.steps') as ReadonlyArray<{ title: string; body: string }>;
  const themes = t.raw('thematiques.items') as readonly string[];
  const faqItems = t.raw('faq.items') as ReadonlyArray<{ question: string; answer: string }>;

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

      <SectionCommentCaMarche heading={t('commentCaMarche.heading')} steps={steps} />

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
