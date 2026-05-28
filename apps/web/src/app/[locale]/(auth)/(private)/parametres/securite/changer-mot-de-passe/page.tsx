// Page /parametres/securite/changer-mot-de-passe — US6.

import { auth } from '@/auth';
import { ChangePasswordForm } from '@/features/auth/ui/ChangePasswordForm';
import { toUrlLocale } from '@/i18n';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Changer mon mot de passe — Conseiller Voyage',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function ChangePasswordPage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/${toUrlLocale(locale)}/connexion`);
  }
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Changer mon mot de passe</h1>
      <p className="mb-8 text-slate-600">
        Saisissez votre mot de passe actuel puis votre nouveau mot de passe. Toutes vos autres
        sessions actives seront déconnectées.
      </p>
      <ChangePasswordForm locale={locale} />
    </main>
  );
}
