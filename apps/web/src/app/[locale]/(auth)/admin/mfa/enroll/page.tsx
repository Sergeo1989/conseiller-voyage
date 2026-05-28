// Server Component admin MFA enrolment (US5 P2).
//
// Mêmes mécaniques que /mfa/enroll (Phase 3) mais avec messaging dédié
// admin :
//   - Texte d'introduction qui rappelle FR-027 "MFA admin obligatoire"
//   - Wording "console d'administration" plutôt que "tableau de bord"
//   - Bouton finalisation redirige vers /admin (pas vers /)

import { auth } from '@/auth';
import { startEnrollmentAction } from '@/features/mfa';
import { EnrollForm } from '@/features/mfa/ui/EnrollForm';
import { toUrlLocale } from '@/i18n';
import { prisma } from '@cv/db';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';

export const metadata = {
  title: 'Activation MFA admin — Conseiller Voyage',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminMfaEnrollPage({ params }: PageProps) {
  const { locale } = await params;

  const session = await auth();
  if (!session?.user) {
    redirect(`/${toUrlLocale(locale)}/login`);
  }
  if (session.user.role !== 'admin') {
    // Un non-admin atterrissant ici n'a rien à y faire — rediriger vers
    // l'enrolment grand public ou home.
    redirect(`/${toUrlLocale(locale)}/mfa/enroll`);
  }

  // Si l'admin est déjà enrôlé, redirect vers la console.
  const existingSecret = await prisma.mfaSecret.findFirst({
    where: { userId: session.user.id, enabledAt: { not: null } },
    select: { id: true },
  });
  if (existingSecret) {
    redirect(`/${toUrlLocale(locale)}/admin`);
  }

  const result = await startEnrollmentAction();

  if (result.kind === 'already_enrolled') {
    redirect(`/${toUrlLocale(locale)}/admin`);
  }

  if (result.kind === 'rate_limited') {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-red-900">
        <h2 className="mb-2 text-lg font-semibold">Trop de tentatives</h2>
        <p>
          Vous avez démarré trop de flows d'enrôlement récemment. Réessayez après{' '}
          <strong>{result.unlockAt || 'quelques minutes'}</strong>.
        </p>
      </div>
    );
  }

  if (result.kind === 'error') {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-red-900">
        <h2 className="mb-2 text-lg font-semibold">Erreur d'enrôlement</h2>
        <p>{result.message}</p>
      </div>
    );
  }

  const qrCodeDataUrl = await QRCode.toDataURL(result.qrCodeKeyUri, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200,
  });

  return (
    <div>
      <div className="mb-6 rounded border-l-4 border-red-600 bg-red-50 p-4">
        <h2 className="text-lg font-semibold text-red-900">MFA admin obligatoire (FR-027)</h2>
        <p className="mt-1 text-sm text-red-900">
          En tant qu'admin de la plateforme, vous DEVEZ activer l'authentification multi-facteur
          avant tout accès à la console d'administration. Cette exigence découle du Principe IX
          NON-NÉGOCIABLE de la constitution v2.2.0.
        </p>
      </div>
      <h2 className="mb-2 text-xl font-semibold">Activer votre MFA admin</h2>
      <p className="mb-8 text-slate-600">
        Suivez les 3 étapes ci-dessous. Une fois activé, un code à 6 chiffres vous sera demandé à
        chaque connexion et avant chaque action sensible (approbation de dossier, révocation de
        conseiller, reset MFA d'un utilisateur).
      </p>
      <EnrollForm
        enrollmentRequestId={result.enrollmentRequestId}
        qrCodeDataUrl={qrCodeDataUrl}
        secretBase32={result.secretBase32}
        backupCodes={result.backupCodes}
      />
    </div>
  );
}
