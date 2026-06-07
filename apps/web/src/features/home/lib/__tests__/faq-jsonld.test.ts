// T022 [US3] — Builder JSON-LD FAQPage (SC-012, contrat L9-L11).
// TDD : écrit ROUGE avant l'implémentation. Fonction PURE, sans I/O.

import { describe, expect, it } from 'vitest';
import { buildFaqJsonLd } from '../faq-jsonld';

const ITEMS = [
  { question: 'Est-ce gratuit ?', answer: 'Oui, sans engagement.' },
  { question: 'Comment vérifiés ?', answer: 'OPC/TICO.' },
];

describe('buildFaqJsonLd', () => {
  const node = buildFaqJsonLd(ITEMS);

  it('produit un nœud FAQPage', () => {
    expect(node['@context']).toBe('https://schema.org');
    expect(node['@type']).toBe('FAQPage');
  });

  it('mappe chaque Q/R en Question + acceptedAnswer/Answer', () => {
    const main = node.mainEntity as Array<Record<string, unknown>>;
    expect(main).toHaveLength(ITEMS.length);
    expect(main[0]?.['@type']).toBe('Question');
    expect(main[0]?.name).toBe(ITEMS[0]?.question);
    const answer = main[0]?.acceptedAnswer as Record<string, unknown>;
    expect(answer['@type']).toBe('Answer');
    expect(answer.text).toBe(ITEMS[0]?.answer);
  });

  it('est pure : mêmes entrées → sortie profondément égale', () => {
    expect(buildFaqJsonLd(ITEMS)).toEqual(node);
  });
});
