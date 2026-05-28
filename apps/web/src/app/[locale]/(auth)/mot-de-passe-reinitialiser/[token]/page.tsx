// Page /mot-de-passe-reinitialiser/[token] — Server Component US5.

import { PasswordResetCompleteForm } from '@/features/auth';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Choisir un nouveau mot de passe — Conseiller Voyage',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ locale: string; token: string }>;
}

export default async function PasswordResetCompletePage({ params }: PageProps): Promise<ReactNode> {
  const { locale, token } = await params;
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">
        Choisir un nouveau mot de passe
      </h1>
      <p className="mb-8 text-slate-600">
        Saisissez votre nouveau mot de passe. Toutes vos sessions actives seront déconnectées par
        mesure de sécurité.
      </p>
      <PasswordResetCompleteForm token={token} locale={locale} />
    </main>
  );
}
