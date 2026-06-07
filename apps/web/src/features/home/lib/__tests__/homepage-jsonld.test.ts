// T021 [US3] — Builder JSON-LD Organization + WebSite (SC-007, contrat L1-L7).
// TDD : écrit ROUGE avant l'implémentation. Fonction PURE, sans I/O.
// Invariant ADR-0002 : AUCUN contactPoint / telephone / email.

import { describe, expect, it } from 'vitest';
import { buildHomepageJsonLd } from '../homepage-jsonld';

describe('buildHomepageJsonLd', () => {
  const nodes = buildHomepageJsonLd('fr', 'https://conseiller-voyage.ca');

  it('retourne un nœud Organization et un nœud WebSite', () => {
    const types = nodes.map((n) => n['@type']);
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
  });

  it('chaque nœud porte @context schema.org', () => {
    for (const n of nodes) expect(n['@context']).toBe('https://schema.org');
  });

  it("l'url pointe vers baseUrl/locale", () => {
    for (const n of nodes) expect(n.url).toBe('https://conseiller-voyage.ca/fr');
  });

  it('ne contient AUCUN contactPoint / telephone / email (ADR-0002)', () => {
    const json = JSON.stringify(nodes).toLowerCase();
    expect(json).not.toContain('contactpoint');
    expect(json).not.toContain('telephone');
    expect(json).not.toContain('"email"');
  });

  it('est pure : mêmes entrées → sortie profondément égale', () => {
    expect(buildHomepageJsonLd('fr', 'https://conseiller-voyage.ca')).toEqual(nodes);
  });
});
