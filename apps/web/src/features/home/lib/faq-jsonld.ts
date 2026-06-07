// T024 [US3] — Builder JSON-LD FAQPage (FR-022, SC-012).
// Fonction PURE : mappe les Q/R i18n en schema.org FAQPage (résultats enrichis
// + citabilité GEO). Aucun I/O.

import type { JsonLdNode } from './homepage-jsonld';

interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export function buildFaqJsonLd(items: readonly FaqItem[]): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
