// T030d + T030e — Layout racine avec NextIntlClientProvider, hreflang,
// `<html lang>` dynamique.

import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { type Locale, locales } from '../../i18n';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export function generateStaticParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    metadataBase: new URL(SITE_URL),
    alternates: {
      // URLs courtes : /fr et /en (le locale interne fr-CA est mappé
      // via next-intl localePrefix.prefixes dans middleware.ts).
      canonical: `${SITE_URL}/${urlPrefixFromLocale(locale)}`,
      languages: {
        'fr-CA': `${SITE_URL}/fr`,
        en: `${SITE_URL}/en`,
        'x-default': `${SITE_URL}/fr`,
      },
    },
  };
}

function urlPrefixFromLocale(locale: string): string {
  if (locale === 'fr-CA') return 'fr';
  if (locale === 'en') return 'en';
  return 'fr';
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<ReactNode> {
  const { locale } = await params;

  if (!(locales as readonly string[]).includes(locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    // `suppressHydrationWarning` sur <html> et <body> : pattern Next.js
    // officiel pour neutraliser les warnings causés par les extensions
    // de navigateur (Grammarly, ColorZilla, Dark Reader, etc.) qui
    // mutent ces éléments AVANT que React hydrate. C'est purement local
    // au boundary de l'élément — n'affecte pas la détection de mismatch
    // dans les enfants.
    // Cf. https://nextjs.org/docs/messages/react-hydration-error
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/*
          Baseline globale : fixe font-size body ≥ 16px (Safari/certains
          Linux livrent 13-14px par défaut, FAIL WCAG 1.4.4), line-height
          ≥ 1.5x, focus-visible visible (Principe XI WCAG 2.4.7), et
          touch targets ≥ 44px sur les boutons via min-height. Pose les
          bases d'accessibilité que les inline styles inline pages
          n'imposent pas.
          Migration future : shadcn/ui + design tokens dans la feature
          design-system. Pour ce MVP, ces 6 règles suffisent à passer
          axe-core sur le commun denominator.
        */}
        <style>{`
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
        `}</style>
      </head>
      <body suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
