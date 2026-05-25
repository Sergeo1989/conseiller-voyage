// Page d'accueil — squelette minimal pour soft-launch pilotes.
//
// Le design final + copy marketing arriveront en feature dédiée (SEO,
// onboarding voyageur, etc.). Pour l'instant, l'objectif est unique :
// donner aux 50-100 conseillers pilotes une porte d'entrée vers leur
// espace + offrir le switch FR/EN visible.
//
// AUDIT DESIGN /design-review FINDING-001 : la page racine était vide
// avant ce fix — les pilotes arrivaient sur `/fr` et ne savaient pas
// où aller.

import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { type Locale, toUrlLocale } from '../../i18n';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function HomePage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const urlLocale = toUrlLocale(locale);
  const otherLocale = urlLocale === 'fr' ? 'en' : 'fr';
  const t = await getTranslations({ locale });

  return (
    <main style={mainStyle}>
      <header style={headerStyle}>
        <h1 style={{ margin: 0, fontSize: 32 }}>{t('common.appName')}</h1>
        <Link href={`/${otherLocale}`} hrefLang={otherLocale} style={langLinkStyle}>
          {otherLocale === 'en' ? 'EN' : 'FR'}
        </Link>
      </header>

      <p style={{ fontSize: 18, color: '#6b7280' }}>{t('common.tagline')}</p>

      <section aria-labelledby="entry-heading" style={{ marginTop: 32 }}>
        <h2 id="entry-heading">
          {urlLocale === 'fr' ? 'Accéder à mon espace' : 'Access my space'}
        </h2>
        <nav style={navStyle} aria-label={urlLocale === 'fr' ? 'Espaces' : 'Spaces'}>
          <Link href={`/${urlLocale}/conseiller/conformite`} style={ctaPrimaryStyle}>
            {urlLocale === 'fr' ? 'Espace conseiller' : 'Advisor space'}
          </Link>
          <Link href={`/${urlLocale}/admin/conformite`} style={ctaSecondaryStyle}>
            {urlLocale === 'fr' ? 'Espace admin' : 'Admin space'}
          </Link>
        </nav>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 16 }}>
          {urlLocale === 'fr'
            ? 'Vous n’avez pas encore de compte ? Contactez votre administrateur.'
            : 'No account yet? Contact your administrator.'}
        </p>
      </section>
    </main>
  );
}

const mainStyle = {
  maxWidth: 800,
  margin: '32px auto',
  padding: '0 24px',
};
const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between' as const,
  alignItems: 'baseline' as const,
};
const langLinkStyle = {
  fontSize: 14,
  fontWeight: 600,
  padding: '6px 12px',
  background: '#f3f4f6',
  borderRadius: 4,
  textDecoration: 'none',
};
const navStyle = {
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap' as const,
  marginTop: 16,
};
const ctaPrimaryStyle = {
  background: '#2563eb',
  color: '#fff',
  padding: '12px 24px',
  borderRadius: 6,
  textDecoration: 'none',
  fontWeight: 600,
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center' as const,
};
const ctaSecondaryStyle = {
  background: '#fff',
  color: '#2563eb',
  border: '2px solid #2563eb',
  padding: '10px 22px',
  borderRadius: 6,
  textDecoration: 'none',
  fontWeight: 600,
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center' as const,
};
