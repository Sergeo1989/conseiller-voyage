// Page publique « Mentions légales » (US2 P1 + US5 P3 — vue OPC).
// Inclut un schéma JSON-LD `Organization` en plus du WebPage standard
// pour aider les crawlers à identifier l'éditeur.

import { buildLegalMetadata, renderLegalPage } from '@/features/legal/ui/page-helpers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const dynamic = 'force-static';

const SLUG = 'mentions-legales';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildLegalMetadata(locale, SLUG);
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactNode> {
  const { locale } = await params;

  // Schéma Organization additionnel — valeurs exactes à compléter au
  // moment de T088-T089 (raison sociale + NEQ + adresse postale).
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Conseiller Voyage',
    description:
      'Plateforme québécoise de mise en relation entre voyageurs et conseillers vérifiés CCV/TICO.',
    url: SITE_URL,
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'CA',
      addressRegion: 'QC',
      // addressLocality, postalCode, streetAddress : à compléter T088
    },
    // Important : pas de contactPoint ni telephone — cf. ADR-0002, le
    // seul contact passe par l'intake voyageur (Principe III).
  };

  return renderLegalPage(locale, SLUG, [organizationJsonLd]);
}
