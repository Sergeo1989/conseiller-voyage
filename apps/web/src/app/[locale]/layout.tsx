// T030d + T030e — Layout racine avec NextIntlClientProvider, hreflang,
// `<html lang>` dynamique.

import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Footer } from '../../components/Footer';
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

  // <html> et <body> sont rendus par app/layout.tsx (root). Ce layout
  // ne fait QUE wrapper avec NextIntlClientProvider + Footer pour le
  // segment localisé. Next.js 15 interdit <html>/<body> dans les layouts
  // imbriqués (cf. https://nextjs.org/docs/app/api-reference/file-conventions/layout#root-layouts).
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
      <Footer locale={locale} />
    </NextIntlClientProvider>
  );
}
