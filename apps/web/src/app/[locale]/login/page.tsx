// Page /login DEV uniquement — bypass d'auth temporaire pour tester
// les flux conseiller/admin avant l'implémentation de la vraie auth
// (module identité, feature ultérieure).
//
// SÉCURITÉ : 404 si NODE_ENV=production.

import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getEnv } from '../../../env';
import type { Locale } from '../../../i18n';
import { devLoginAction } from './actions';

interface PageProps {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function DevLoginPage({
  params,
  searchParams,
}: PageProps): Promise<ReactNode> {
  if (getEnv().NODE_ENV === 'production') {
    notFound();
  }

  const { locale } = await params;
  const sp = await searchParams;

  async function loginAsConseiller(): Promise<void> {
    'use server';
    await devLoginAction('conseiller', locale);
  }

  async function loginAsAdmin(): Promise<void> {
    'use server';
    await devLoginAction('admin', locale);
  }

  return (
    <main
      style={{
        maxWidth: 600,
        margin: '64px auto',
        padding: '0 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={bannerStyle}>
        ⚠ <strong>Page développement uniquement</strong> — bypass d'auth pour tester les flux. En
        production, la vraie authentification (passkey / magic link) sera implémentée par le module
        identité.
      </div>

      <h1>Connexion dev</h1>
      <p style={{ color: '#6b7280' }}>
        Sélectionne un compte de test pré-seedé pour accéder à son espace.
      </p>
      {sp.callbackUrl && (
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          Tu seras redirigé vers : <code>{sp.callbackUrl}</code>
        </p>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 32, flexWrap: 'wrap' }}>
        <form action={loginAsConseiller} style={cardStyle}>
          <h2 style={{ margin: '0 0 8px' }}>👤 Conseiller</h2>
          <p style={{ color: '#6b7280', margin: '0 0 16px' }}>
            <code>conseiller@test.cv</code>
            <br />
            Accès à <code>/conseiller/conformite</code>
          </p>
          <button type="submit" style={buttonConseillerStyle}>
            Se connecter
          </button>
        </form>

        <form action={loginAsAdmin} style={cardStyle}>
          <h2 style={{ margin: '0 0 8px' }}>🛠 Admin</h2>
          <p style={{ color: '#6b7280', margin: '0 0 16px' }}>
            <code>admin@test.cv</code>
            <br />
            Accès à <code>/admin/conformite</code>
          </p>
          <button type="submit" style={buttonAdminStyle}>
            Se connecter
          </button>
        </form>
      </div>

      <p style={{ color: '#6b7280', fontSize: 13, marginTop: 32 }}>
        Si tu vois une erreur "Utilisateur dev introuvable", lance d'abord :{' '}
        <code>pnpm db:seed:dev</code>
      </p>
    </main>
  );
}

const bannerStyle = {
  background: '#fef3c7',
  border: '1px solid #f59e0b',
  color: '#78350f',
  padding: 12,
  borderRadius: 6,
  marginBottom: 24,
};

const cardStyle = {
  flex: '1 1 240px',
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 20,
};

const buttonConseillerStyle = {
  background: '#2563eb',
  color: '#fff',
  padding: '10px 20px',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer' as const,
  fontSize: 15,
  width: '100%',
};

const buttonAdminStyle = {
  ...buttonConseillerStyle,
  background: '#16a34a',
};
