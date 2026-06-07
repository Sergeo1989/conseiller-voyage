// T023 [US3] — Builder JSON-LD de la page d'accueil (FR-010, SC-007).
// Fonction PURE : Organization + WebSite, SANS contactPoint/telephone/email
// (anti-marketplace, ADR-0002). `locale` = segment d'URL ("fr" | "en").

export interface JsonLdNode {
  readonly '@context': 'https://schema.org';
  readonly '@type': string;
  readonly [key: string]: unknown;
}

const ORG_NAME = 'Conseiller Voyage';

export function buildHomepageJsonLd(locale: string, baseUrl: string): JsonLdNode[] {
  const url = `${baseUrl}/${locale}`;
  const lang = locale === 'en' ? 'en-CA' : 'fr-CA';

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: ORG_NAME,
      url,
      areaServed: 'CA',
      knowsLanguage: [lang],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: ORG_NAME,
      url,
      inLanguage: lang,
    },
  ];
}
