// Server Component /mfa/recovery (US3 — code de récupération).

import { auth } from '@/auth';
import { VerifyBackupCodeForm } from '@/features/mfa/ui/VerifyBackupCodeForm';
import { toUrlLocale } from '@/i18n';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Code de récupération MFA — Conseiller Voyage',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function MfaRecoveryPage({ params }: PageProps) {
  const { locale } = await params;

  const session = await auth();
  if (!session?.user) {
    redirect(`/${toUrlLocale(locale)}/login`);
  }

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold">Code de récupération</h2>
      <p className="mb-6 text-slate-600">
        Vous n'avez pas accès à votre device TOTP ? Utilisez l'un de vos codes de récupération
        sauvegardés lors de l'enrôlement.
      </p>
      <VerifyBackupCodeForm />
    </div>
  );
}
