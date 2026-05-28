// Page /inscription — Server Component public US1.
//
// noindex (Principe XII SEO — page privée par nature). Layout shadcn
// minimal, formulaire Client SignupForm.

import { SignupForm } from '@/features/auth/ui/SignupForm';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Inscription conseiller — Conseiller Voyage',
  description: 'Créer un compte conseiller en voyage.',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function SignupPage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Créer un compte conseiller</h1>
      <p className="mb-8 text-slate-600">
        Rejoignez Conseiller Voyage en tant que conseiller en voyage. Vous devrez confirmer votre
        courriel puis compléter votre dossier de conformité CCV / TICO avant d'accéder aux briefs
        voyageurs.
      </p>
      <SignupForm locale={locale} />
      <p className="mt-6 text-sm text-slate-500">
        Vous avez déjà un compte ?{' '}
        <a href={`/${locale}/connexion`} className="text-blue-600 underline">
          Connectez-vous
        </a>
        .
      </p>
    </main>
  );
}
