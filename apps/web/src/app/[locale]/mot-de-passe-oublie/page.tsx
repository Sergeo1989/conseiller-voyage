// Page /mot-de-passe-oublie — Server Component US5.

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PasswordResetRequestForm } from '../../../components/auth/PasswordResetRequestForm';

export const metadata: Metadata = {
  title: 'Mot de passe oublié — Conseiller Voyage',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function PasswordResetRequestPage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Mot de passe oublié</h1>
      <p className="mb-8 text-slate-600">
        Saisissez le courriel associé à votre compte. Nous vous enverrons un lien pour choisir un
        nouveau mot de passe.
      </p>
      <PasswordResetRequestForm />
      <p className="mt-6 text-sm text-slate-500">
        Retour à la{' '}
        <a href={`/${locale}/connexion`} className="text-blue-600 underline">
          page de connexion
        </a>
        .
      </p>
    </main>
  );
}
