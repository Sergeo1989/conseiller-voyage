// Server Component /mfa/verify (US3 — connexion 2e facteur TOTP).
// Exige une session authentifiée (post-mot-de-passe). Si mfaVerifiedAt
// est déjà fresh, redirect direct vers la home.

import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import { VerifyTotpForm } from '../../../../../components/mfa/VerifyTotpForm';
import { toUrlLocale } from '../../../../../i18n';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ return?: string }>;
}

export default async function MfaVerifyPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { return: returnUrl } = await searchParams;

  const session = await auth();
  if (!session?.user) {
    redirect(`/${toUrlLocale(locale)}/login`);
  }

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold">Vérification en deux étapes</h2>
      <p className="mb-6 text-slate-600">
        Pour finaliser votre connexion, confirmez votre identité avec votre application TOTP.
      </p>
      <VerifyTotpForm {...(returnUrl ? { returnUrl } : {})} />
    </div>
  );
}
