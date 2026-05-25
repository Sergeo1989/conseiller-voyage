// Footer permanent (US2 P1 — FR-005 du spec 004).
//
// Purement statique (HTML+CSS, zéro JS, zéro donnée dynamique). Aucune
// hydration côté client. L'année du copyright est hardcodée — bumpée
// par commit annuel explicite (rappel calendrier janvier, cf. plan 004).
//
// Accessibilité (Principe XI NON-NÉGOCIABLE) :
//   - 5 liens identifiés via aria-label explicites (lecteur d'écran)
//   - Touch targets ≥ 44 px (min-height héritée du baseline a11y CSS
//     du layout racine + padding vertical sur chaque <a>)
//   - Focus visible (outline 2px hérité de :focus-visible global)
//   - Contraste ≥ 4.5:1 (texte gris foncé sur fond gris clair)

import type { ReactNode } from 'react';
import { toUrlLocale } from '../i18n';

const COPYRIGHT_YEAR = 2026;

interface FooterLink {
  readonly slug: string;
  readonly label: string;
  readonly ariaLabel: string;
}

const LEGAL_LINKS: ReadonlyArray<FooterLink> = [
  {
    slug: 'mentions-legales',
    label: 'Mentions légales',
    ariaLabel: 'Mentions légales — ouvre la page des mentions légales',
  },
  {
    slug: 'cgu-voyageur',
    label: 'CGU voyageur',
    ariaLabel: "Conditions d'utilisation pour les voyageurs",
  },
  {
    slug: 'cgu-conseiller',
    label: 'CGU conseiller',
    ariaLabel: "Conditions d'utilisation pour les conseillers",
  },
  {
    slug: 'confidentialite',
    label: 'Confidentialité',
    ariaLabel: 'Politique de confidentialité Loi 25',
  },
  {
    slug: 'comment-ca-marche',
    label: 'Comment ça marche',
    ariaLabel: 'Comment fonctionne Conseiller Voyage — pas une agence de voyages',
  },
];

export function Footer({ locale }: { locale: string }): ReactNode {
  const urlLocale = toUrlLocale(locale);

  return (
    <footer
      style={{
        marginTop: '4rem',
        padding: '2rem 1.25rem',
        borderTop: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
        color: '#374151',
        fontSize: '0.9rem',
      }}
    >
      <nav aria-label="Liens légaux" style={{ maxWidth: '960px', margin: '0 auto' }}>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem 1.5rem',
            justifyContent: 'center',
          }}
        >
          {LEGAL_LINKS.map((link) => (
            <li key={link.slug}>
              <a
                href={`/${urlLocale}/${link.slug}`}
                aria-label={link.ariaLabel}
                style={{
                  display: 'inline-block',
                  // Touch target ≥ 44px : padding + min-height calculé
                  padding: '0.75rem 0.5rem',
                  minHeight: '44px',
                  color: '#1f2937',
                  textDecoration: 'underline',
                  textDecorationColor: '#9ca3af',
                  textUnderlineOffset: '3px',
                }}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <p
          style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            marginBottom: 0,
            color: '#6b7280',
            fontSize: '0.85rem',
          }}
        >
          © {COPYRIGHT_YEAR} Conseiller Voyage · Mise en relation voyageurs ↔ conseillers vérifiés
          CCV/TICO · Plateforme indépendante, pas une agence de voyages
        </p>
      </nav>
    </footer>
  );
}
