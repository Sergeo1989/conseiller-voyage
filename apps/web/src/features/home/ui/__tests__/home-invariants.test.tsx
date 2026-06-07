// T007 [US1] — Invariants anti-marketplace du héro (ADR-0002, SC-002/003/009).
//
// TDD strict (Principe VI) : ce test est écrit ROUGE avant l'implémentation
// du héro. Il rend le composant en HTML statique (preuve SSR/no-JS, SC-009)
// et vérifie les garde-fous : un seul <h1>, exactement UN CTA primaire vers
// l'intake, AUCUNE coordonnée de contact direct.

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Hero } from '../Hero';

// next/link n'est pas exécutable hors runtime Next : on le remplace par une
// ancre simple qui préserve le href (suffisant pour les assertions de contrat).
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function renderHero(): string {
  return renderToStaticMarkup(
    <Hero
      urlLocale="fr"
      title="Décrivez votre voyage. On vous présente les 3 conseillers vérifiés faits pour vous."
      subtitle="Indépendant de tout réseau. Aucun frais de plus qu'en ligne."
      ctaLabel="Décrire mon voyage"
      freeLabel="Gratuit pour les voyageurs, sans engagement"
      trustLabel="Tous vérifiés OPC/TICO"
    />,
  );
}

describe('Hero — invariants anti-marketplace (US1)', () => {
  it('rend un contenu statique exploitable sans JavaScript (SC-009)', () => {
    const html = renderHero();
    expect(html).toContain('Décrivez votre voyage');
    expect(html).toContain('Décrire mon voyage');
  });

  it('contient exactement un <h1> (a11y, contrat U1/A2)', () => {
    const html = renderHero();
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
  });

  it('expose exactement UN CTA primaire vers l’intake /voyage/nouveau (SC-003)', () => {
    const html = renderHero();
    const ctas = html.match(/href="\/fr\/voyage\/nouveau"/g) ?? [];
    expect(ctas.length).toBe(1);
  });

  it('ne contient AUCUNE coordonnée de contact direct (SC-002, ADR-0002)', () => {
    const html = renderHero();
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('tel:');
  });
});
