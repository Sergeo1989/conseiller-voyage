// Sitemap dynamique (Principe XII — pages publiques indexables).
// - 5 pages légales SSG (statiques)
// - Profils conseillers publiables (statut='pret' + verified) lus via
//   l'API publique apps/api → /api/public/profil (T091 feature 007).
//   À pagination future > 50k URLs (cf. research.md R4-bis).
//
// Référencé automatiquement par Next.js à `/sitemap.xml`. Revalidation 1h.

import { lireSlugsPubliables } from '@/features/profil-public/infrastructure/public-reader';
import type { MetadataRoute } from 'next';
import { locales, toUrlLocale } from '../i18n';

export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

const LEGAL_SLUGS = [
  'comment-ca-marche',
  'mentions-legales',
  'cgu-voyageur',
  'cgu-conseiller',
  'confidentialite',
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [...buildLocaleHomes(), ...buildLegalPages(), ...(await buildProfilPages())];
}

function buildLocaleHomes(): MetadataRoute.Sitemap {
  return locales.map((locale) => ({
    url: `${SITE_URL}/${toUrlLocale(locale)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 1.0,
  }));
}

function buildLegalPages(): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  for (const slug of LEGAL_SLUGS) {
    for (const locale of locales) {
      out.push({
        url: `${SITE_URL}/${toUrlLocale(locale)}/${slug}`,
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
  return out;
}

async function buildProfilPages(): Promise<MetadataRoute.Sitemap> {
  // T091 — best-effort, fallback safe si l'API publique est indisponible.
  let slugs: readonly string[] = [];
  try {
    slugs = await lireSlugsPubliables();
  } catch {
    return [];
  }
  const out: MetadataRoute.Sitemap = [];
  for (const slug of slugs) {
    for (const locale of locales) {
      out.push({
        url: `${SITE_URL}/${toUrlLocale(locale)}/conseiller/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
  }
  return out;
}
