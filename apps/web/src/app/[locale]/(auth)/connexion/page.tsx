// Page /connexion — Server Component public US2.
//
// noindex (Principe XII SEO — page privée).

import { LoginForm } from '@/features/auth';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Connexion — Conseiller Voyage',
  description: 'Se connecter à son espace conseiller.',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ verified?: string }>;
}

export default async function LoginPage({ params, searchParams }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const { verified } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Connexion</h1>
      {verified === '1' && (
        <output className="mb-6 block rounded-md border border-green-300 bg-green-50 p-3 text-green-900">
          Votre courriel a été vérifié. Vous pouvez maintenant vous connecter.
        </output>
      )}
      <p className="mb-8 text-slate-600">
        Saisissez votre courriel et votre mot de passe pour accéder à votre espace.
      </p>
      <LoginForm locale={locale} />
      <p className="mt-6 text-sm text-slate-500">
        Pas encore de compte ?{' '}
        <a href={`/${locale}/inscription`} className="text-blue-600 underline">
          Créer un compte conseiller
        </a>
        .
      </p>
    </main>
  );
}
