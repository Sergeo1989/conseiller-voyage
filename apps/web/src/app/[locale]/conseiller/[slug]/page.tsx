// T080 — Page publique conseiller (feature 007 US2).
//
// SSG ISR Next.js 15 :
//   - params: Promise<...> async (L1)
//   - generateStaticParams: [] + dynamicParams: true (C5 — pas de
//     pre-build, rendu à la demande)
//   - revalidate: 300 (filet 5 min — C2)
//   - experimental_ppr opt-in (L3) si configuré
//
// Anti-marketplace strict (Principe I + ADR-0002 + SC-002) :
//   - CTA unique vers /[locale]/intake?suggested=<id>
//   - AUCUN mailto/tel/form contact
//   - Section pédagogique permanente
//   - Schema.org Person SANS contactPoint/telephone
//
// Anti-énumération SC-003 :
//   - notFound() Next.js → app/[locale]/not-found.tsx unifié

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BadgeVerifie } from '../../../../components/profil-public/BadgeVerifie';
import { CtaSuggested } from '../../../../components/profil-public/CtaSuggested';
import { ProfilHero } from '../../../../components/profil-public/ProfilHero';
import { ProfilSections } from '../../../../components/profil-public/ProfilSections';
import { SectionPourquoiPasContact } from '../../../../components/profil-public/SectionPourquoiPasContact';
import { type Locale, toUrlLocale } from '../../../../i18n';
import { lireProfilPublicBySlug } from '../../../../lib/profil/server-actions';

interface PageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

// Pas de pre-build à la création — rendu à la demande puis cache ISR
// (cf. research.md R4-bis : évite long build > 5 min à grande échelle).
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return [];
}

export const dynamicParams = true;
export const revalidate = 300;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const profil = await lireProfilPublicBySlug(slug);
  if (!profil) return { robots: { index: false } };

  const specialitePrincipale = profil.specialites[0]?.label;
  const title = specialitePrincipale
    ? `${profil.nomAffiche} — ${specialitePrincipale}`
    : profil.nomAffiche;
  const description = profil.biographie.slice(0, 157) + (profil.biographie.length > 160 ? '…' : '');
  const urlLocale = toUrlLocale(locale);
  const canonical = `${SITE_URL}/${urlLocale}/conseiller/${profil.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: profil.photoUrlPublique ? [{ url: profil.photoUrlPublique }] : [],
      locale: locale === 'fr-CA' ? 'fr_CA' : 'en_US',
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function ProfilPublicPage({ params }: PageProps) {
  const { locale, slug } = await params;
  const profil = await lireProfilPublicBySlug(slug);
  if (!profil) notFound();

  const urlLocale = toUrlLocale(locale);

  // Schema.org Person — SANS contactPoint/telephone/email (Principe I + ADR-0002).
  // L'unique action structurée pointe vers /intake (mise en relation
  // qualifiée, pas contact direct).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profil.nomAffiche,
    image: profil.photoUrlPublique,
    knowsLanguage: profil.langues.map((l) => l.code),
    knowsAbout: profil.specialites.map((s) => s.label),
    memberOf: {
      '@type': 'ProfessionalService',
      name: 'Conseiller Voyage',
      url: SITE_URL,
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/${urlLocale}/intake?suggested=${profil.conseillerId}`,
    },
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requis pour SEO (Schema.org)
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ProfilHero
        nomAffiche={profil.nomAffiche}
        titre={profil.titre}
        photoUrl={profil.photoUrlPublique}
        photoWidth={profil.photoWidth}
        photoHeight={profil.photoHeight}
      />

      <BadgeVerifie verifie={profil.verifieOPCTICO} />

      <ProfilSections
        biographie={profil.biographie}
        specialites={profil.specialites}
        langues={profil.langues}
        zonesGeographiques={profil.zonesGeographiques}
        anneesExperience={profil.anneesExperience}
      />

      <CtaSuggested locale={urlLocale} conseillerId={profil.conseillerId} variant="primary" />

      <SectionPourquoiPasContact locale={urlLocale} />

      <CtaSuggested locale={urlLocale} conseillerId={profil.conseillerId} variant="footer" />
    </main>
  );
}
