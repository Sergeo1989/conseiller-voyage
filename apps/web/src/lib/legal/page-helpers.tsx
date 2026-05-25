// Helpers partagés pour les 5 pages publiques sous (legal)/.
// Évite la duplication de generateMetadata + Server Component shape.

import type { Metadata } from 'next';
import { MDXRemote } from 'next-mdx-remote/rsc';
import type { ReactNode } from 'react';
import { loadLegalMdx } from './content-loader';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

function urlPrefixFromLocale(locale: string): string {
  if (locale === 'fr-CA') return 'fr';
  if (locale === 'en') return 'en';
  return 'fr';
}

/**
 * Construit l'objet `Metadata` Next.js depuis le frontmatter MDX d'un
 * document légal.
 *
 * @param locale locale interne next-intl (`fr-CA` ou `en`)
 * @param slug nom du fichier MDX sans extension
 */
export async function buildLegalMetadata(locale: string, slug: string): Promise<Metadata> {
  const { frontmatter } = await loadLegalMdx(locale, slug);
  const urlLocale = urlPrefixFromLocale(locale);
  return {
    title: frontmatter.title,
    description: frontmatter.description,
    alternates: {
      canonical: `${SITE_URL}/${urlLocale}/${slug}`,
      languages: {
        'fr-CA': `${SITE_URL}/fr/${slug}`,
        en: `${SITE_URL}/en/${slug}`,
        'x-default': `${SITE_URL}/fr/${slug}`,
      },
    },
    openGraph: {
      title: frontmatter.title,
      description: frontmatter.description,
      type: 'article',
      locale,
      url: `${SITE_URL}/${urlLocale}/${slug}`,
      siteName: 'Conseiller Voyage',
    },
    twitter: {
      card: 'summary',
      title: frontmatter.title,
      description: frontmatter.description,
    },
  };
}

/**
 * Server Component qui rend une page légale : titre `<h1>`, JSON-LD
 * `WebPage`, contenu MDX rendu via `next-mdx-remote/rsc`.
 *
 * @param locale locale interne next-intl
 * @param slug nom du fichier MDX
 * @param extraJsonLd objets JSON-LD additionnels (typiquement
 *   `Organization` pour la page mentions-legales)
 */
export async function renderLegalPage(
  locale: string,
  slug: string,
  extraJsonLd: ReadonlyArray<Record<string, unknown>> = [],
): Promise<ReactNode> {
  const { frontmatter, content } = await loadLegalMdx(locale, slug);
  const urlLocale = urlPrefixFromLocale(locale);

  const webPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: frontmatter.title,
    description: frontmatter.description,
    inLanguage: locale,
    url: `${SITE_URL}/${urlLocale}/${slug}`,
    dateModified: frontmatter.effectiveAt,
    datePublished: frontmatter.publishedAt,
  };

  return (
    <main
      style={{
        maxWidth: '760px',
        margin: '0 auto',
        padding: '2rem 1.25rem 4rem',
      }}
    >
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD doit être injecté brut côté SSR pour être indexé par les crawlers ; pas de risque XSS car le contenu vient du frontmatter typé Zod (pas d'input user)
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      {extraJsonLd.map((schema, i) => (
        <script
          // biome-ignore lint/suspicious/noArrayIndexKey: extraJsonLd est une liste statique ordonnée par appelant, index stable au build SSG
          key={i}
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: idem — JSON-LD statique au build, pas d'input user
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <article>
        <h1>{frontmatter.title}</h1>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '-0.5rem' }}>
          Version {frontmatter.version} · En vigueur depuis le{' '}
          {new Date(frontmatter.effectiveAt).toLocaleDateString('fr-CA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        <MDXRemote source={content} />
      </article>
    </main>
  );
}
