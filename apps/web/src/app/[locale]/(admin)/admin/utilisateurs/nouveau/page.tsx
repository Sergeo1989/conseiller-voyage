// Page /admin/utilisateurs/nouveau — US7 invitation admin.

import { auth } from '@/auth';
import { InviteAdminForm } from '@/features/auth';
import { toUrlLocale } from '@/i18n';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Inviter un administrateur — Conseiller Voyage',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function InviteAdminPage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    redirect(`/${toUrlLocale(locale)}/connexion`);
  }
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">Inviter un administrateur</h1>
      <p className="mb-8 text-slate-600">
        Le nouvel administrateur recevra un courriel avec un lien d'activation valide 72 heures.
      </p>
      <InviteAdminForm />
    </main>
  );
}
