// Root layout — Next.js 15 App Router exige un layout racine. Sans ce
// fichier, Next.js auto-injecte un <html><body> SANS lang attribute,
// ce qui casse Principe XI (axe-core html-has-lang serious).
//
// Pose <html lang="fr-CA"> par défaut (locale primaire next-intl). Les
// pages [locale]/* peuvent ajuster via metadata. Pas de <head> manuel —
// Next.js le génère depuis les metadata exports (title, robots, etc.).
//
// Les styles globaux d'accessibilité sont importés via globals.css —
// Next.js les inline dans son <head> auto-généré.

import { GeistSans } from 'geist/font/sans';
import type { ReactNode } from 'react';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="fr-CA" className={GeistSans.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
