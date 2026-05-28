// Page /inscription/confirmation — Server Component post-signup US1.
//
// Affiche le message statique « vérifiez vos spams » + bouton « Renvoyer »
// avec countdown 60s (US3 / M8).
//
// noindex (page privée).

import { ResendCountdownButton } from '@/features/auth';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Vérifiez votre courriel — Conseiller Voyage',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}

export default async function ConfirmationPage({
  params,
  searchParams,
}: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const { email } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Vérifiez votre courriel</h1>
      <p className="mb-4 text-slate-700">
        Nous venons d'envoyer un courriel de vérification
        {email ? (
          <>
            {' '}
            à <strong>{email}</strong>
          </>
        ) : null}
        . Cliquez le lien dans ce courriel pour activer votre compte.
      </p>
      <p className="mb-6 text-slate-600">
        Le courriel peut prendre quelques minutes à arriver. Pensez à vérifier vos courriels
        indésirables ou spam.
      </p>
      {email ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm text-slate-700">
            Vous n'avez rien reçu après quelques minutes ?
          </p>
          <ResendCountdownButton email={email} />
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Retournez sur la{' '}
          <a href={`/${locale}/connexion`} className="text-blue-600 underline">
            page de connexion
          </a>{' '}
          pour demander un nouveau lien.
        </p>
      )}
    </main>
  );
}
