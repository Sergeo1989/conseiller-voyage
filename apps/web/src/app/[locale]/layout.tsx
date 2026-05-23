import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { type Locale, locales } from '../../i18n';

// Layout racine pour le routing localisé.
// Les balises hreflang complètes seront ajoutées en T030e.
export default function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}): ReactNode {
  if (!(locales as readonly string[]).includes(params.locale)) {
    notFound();
  }

  const locale = params.locale as Locale;

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}

export function generateStaticParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}
