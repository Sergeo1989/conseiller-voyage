// T011 [US2] — Présence des sections de différenciation + invariants (contrat
// homepage-ui U4-U8, U11-U14). TDD : écrit ROUGE avant les composants.
//
// On rend chaque section en HTML statique (renderToStaticMarkup) et on vérifie
// le contenu clé, les liens (comment-ca-marche / intake) et l'absence de toute
// mécanique de devis/soumission ou de contact direct (ADR-0002).

import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BandeauLoi25 } from '../BandeauLoi25';
import { MentionPasDeContact } from '../MentionPasDeContact';
import { SectionCommentCaMarche } from '../SectionCommentCaMarche';
import { SectionFaq } from '../SectionFaq';
import { SectionNeutralite } from '../SectionNeutralite';
import { SectionPourquoiTrois } from '../SectionPourquoiTrois';
import { SectionThematiquesTeaser } from '../SectionThematiquesTeaser';
import { TrustBannerOpcTico } from '../TrustBannerOpcTico';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const STEPS = [
  { title: 'Décrivez votre voyage', body: 'Quelques minutes.' },
  { title: 'On vous présente jusqu’à 3 conseillers', body: 'Appariement vérifié.' },
  { title: 'Vous échangez et vous choisissez', body: 'Sans frais.' },
];
const FAQ = [
  { question: 'Est-ce gratuit ?', answer: 'Oui.' },
  { question: 'Comment vérifiés ?', answer: 'OPC/TICO.' },
  { question: 'Pas de contact direct ?', answer: 'Mise en relation.' },
  { question: 'Combien de conseillers ?', answer: 'Jusqu’à 3.' },
];
const THEMES = ['Lune de miel', 'Croisière', 'Europe'];

function renderAll(): string {
  return [
    renderToStaticMarkup(<SectionCommentCaMarche heading="Comment ça marche" steps={STEPS} />),
    renderToStaticMarkup(
      <TrustBannerOpcTico
        label="Tous vérifiés OPC/TICO"
        linkLabel="En savoir plus"
        urlLocale="fr"
      />,
    ),
    renderToStaticMarkup(
      <SectionPourquoiTrois
        heading="Pourquoi 3"
        body="…jusqu'à 3 conseillers…"
        note="Pas une liste."
      />,
    ),
    renderToStaticMarkup(
      <SectionNeutralite heading="Indépendant et neutre" body="Tout conseiller vérifié." />,
    ),
    renderToStaticMarkup(
      <SectionThematiquesTeaser
        heading="Quel que soit votre voyage"
        items={THEMES}
        urlLocale="fr"
      />,
    ),
    renderToStaticMarkup(<SectionFaq heading="Questions fréquentes" items={FAQ} />),
    renderToStaticMarkup(
      <BandeauLoi25 heading="Données au Canada" body="Aucun partage sans accord." />,
    ),
    renderToStaticMarkup(
      <MentionPasDeContact
        heading="Pourquoi pas de contact direct ?"
        body="Mise en relation."
        linkLabel="Comprendre"
        urlLocale="fr"
      />,
    ),
  ].join('\n');
}

describe('US2 — sections de différenciation', () => {
  it('Comment ça marche : 3 étapes, sans devis ni soumission (FR-020)', () => {
    const html = renderToStaticMarkup(
      <SectionCommentCaMarche heading="Comment ça marche" steps={STEPS} />,
    );
    for (const s of STEPS) expect(html).toContain(s.title);
    expect(html.toLowerCase()).not.toContain('devis');
    expect(html.toLowerCase()).not.toContain('soumission');
  });

  it('Bandeau OPC/TICO et mention anti-contact pointent vers /comment-ca-marche (FR-004/006)', () => {
    const html = renderAll();
    const links = html.match(/href="\/fr\/comment-ca-marche"/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(2);
  });

  it('Pourquoi 3 emploie « jusqu’à 3 » (FR-014)', () => {
    const html = renderToStaticMarkup(
      <SectionPourquoiTrois
        heading="Pourquoi 3"
        body="…jusqu'à 3 conseillers…"
        note="Pas une liste."
      />,
    );
    // renderToStaticMarkup échappe l'apostrophe en &#x27; — on normalise avant l'assertion.
    const normalized = html.replace(/&#x27;|&#39;/g, "'").toLowerCase();
    expect(normalized).toContain("jusqu'à 3");
  });

  it('FAQ : au moins 4 questions (FR-022)', () => {
    const html = renderToStaticMarkup(<SectionFaq heading="Questions fréquentes" items={FAQ} />);
    for (const f of FAQ) expect(html).toContain(f.question);
  });

  it('Teaser thématiques : chaque entrée mène à l’intake, jamais à un contact (FR-023)', () => {
    const html = renderToStaticMarkup(
      <SectionThematiquesTeaser
        heading="Quel que soit votre voyage"
        items={THEMES}
        urlLocale="fr"
      />,
    );
    const intakeLinks = html.match(/href="\/fr\/voyage\/nouveau"/g) ?? [];
    expect(intakeLinks.length).toBe(THEMES.length);
  });

  it('Aucune coordonnée de contact direct sur l’ensemble des sections (SC-002, ADR-0002)', () => {
    const html = renderAll();
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('tel:');
  });
});
