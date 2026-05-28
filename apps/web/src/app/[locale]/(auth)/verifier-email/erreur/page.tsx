// Page /verifier-email/erreur — Server Component US3.
//
// Affichée par le redirect du GET /api/auth/verify-email quand le token
// est invalide, expiré, ou déjà consommé. Propose un renvoi de courriel
// si l'utilisateur saisit son email.

import { ResendCountdownButton } from '@/features/auth';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Lien expiré — Conseiller Voyage',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyEmailErrorPage({
  params,
  searchParams,
}: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const { email } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Lien expiré ou invalide</h1>
      <p className="mb-4 text-slate-700">
        Le lien de vérification que vous avez utilisé n'est plus valide. C'est peut-être parce que :
      </p>
      <ul className="mb-6 list-inside list-disc space-y-1 text-slate-700">
        <li>il a déjà été utilisé,</li>
        <li>il a expiré (24 h après l'envoi),</li>
        <li>il a été remplacé par un courriel plus récent.</li>
      </ul>
      {email ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm text-slate-700">
            Demandez un nouveau lien pour <strong>{email}</strong>.
          </p>
          <ResendCountdownButton email={email} />
        </div>
      ) : (
        <p className="text-slate-600">
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
