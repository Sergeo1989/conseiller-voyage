// Sitemap statique au MVP (Principe XII — pages publiques indexables).
// Les 5 pages légales SSG sont déclarées explicitement. La feature 017
// (Tier 3) générera un sitemap dynamique qui inclura les profils
// conseillers + pages thématiques + ces 5 pages.
//
// Référencé automatiquement par Next.js à `/sitemap.xml`.

import type { MetadataRoute } from 'next';
import { locales, toUrlLocale } from '../i18n';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const LEGAL_SLUGS = [
  'comment-ca-marche',
  'mentions-legales',
  'cgu-voyageur',
  'cgu-conseiller',
  'confidentialite',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  // Pages racines (accueil par locale)
  for (const locale of locales) {
    const urlLocale = toUrlLocale(locale);
    entries.push({
      url: `${SITE_URL}/${urlLocale}`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    });
  }

  // Pages légales — toutes locales
  for (const slug of LEGAL_SLUGS) {
    for (const locale of locales) {
      const urlLocale = toUrlLocale(locale);
      entries.push({
        url: `${SITE_URL}/${urlLocale}/${slug}`,
        lastModified: new Date('2026-05-25'),
        changeFrequency: 'yearly',
        priority: slug === 'comment-ca-marche' ? 0.9 : 0.5,
        alternates: {
          languages: {
            'fr-CA': `${SITE_URL}/fr/${slug}`,
            en: `${SITE_URL}/en/${slug}`,
            'x-default': `${SITE_URL}/fr/${slug}`,
          },
        },
      });
    }
  }

  return entries;
}
