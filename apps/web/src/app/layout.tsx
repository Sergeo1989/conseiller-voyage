// Root layout — Next.js 15 App Router exige un layout racine. Sans ce
// fichier, Next.js auto-injecte un <html><body> SANS lang attribute,
// ce qui casse Principe XI (axe-core html-has-lang serious).
//
// Pose <html lang="fr-CA"> par défaut (locale primaire next-intl). Les
// pages [locale]/* peuvent ajuster via metadata, et la directive dans
// app/[locale]/layout.tsx update le lang client-side via <html lang> wrapper
// dynamique (next-intl gère). Le serveur sert toujours fr-CA initial.
//
// Inclut aussi les styles globaux d'accessibilité (Principe XI) :
//   - font-size ≥ 16px (WCAG 1.4.4)
//   - focus-visible visible (WCAG 2.4.7)
//   - touch targets ≥ 44px
//   - prefers-reduced-motion respecté

import type { ReactNode } from 'react';

const GLOBAL_A11Y_STYLES = `
  html, body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    color: #111827;
  }
  *, *::before, *::after { box-sizing: border-box; }
  :focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
    border-radius: 2px;
  }
  button:focus-visible, a:focus-visible {
    outline-offset: 3px;
  }
  button {
    min-height: 44px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  button:not(:disabled):hover {
    filter: brightness(0.92);
  }
  a { color: #2563eb; }
  a:hover { text-decoration: underline; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="fr-CA" suppressHydrationWarning>
      <head>
        <style>{GLOBAL_A11Y_STYLES}</style>
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
