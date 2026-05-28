// Page /admin/accepter-invitation/[token] — US7 acceptance.

import { AcceptAdminInvitationForm } from '@/features/auth';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: "Accepter l'invitation — Conseiller Voyage",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ locale: string; token: string }>;
}

export default async function AcceptInvitationPage({ params }: PageProps): Promise<ReactNode> {
  const { locale, token } = await params;
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">
        Accepter l'invitation administrateur
      </h1>
      <p className="mb-8 text-slate-600">
        Complétez votre profil pour activer votre compte administrateur. Vous serez ensuite redirigé
        vers l'enrôlement MFA obligatoire.
      </p>
      <AcceptAdminInvitationForm token={token} locale={locale} />
    </main>
  );
}
