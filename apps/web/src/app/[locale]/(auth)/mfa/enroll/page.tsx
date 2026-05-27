// Server Component /mfa/enroll — flow d'enrôlement TOTP US1.
// Appelle startEnrollmentAction au mount, génère le QR code data URL
// côté serveur (sécurité : le secret ne quitte pas le serveur via Client
// props — il est embed dans le DOM HTML directement), puis rend
// <EnrollForm> Client.

import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { auth } from '../../../../../auth';
import { EnrollForm } from '../../../../../components/mfa/EnrollForm';
import { toUrlLocale } from '../../../../../i18n';
import { startEnrollmentAction } from '../../../../../lib/mfa/server-actions';

// Force le rendu dynamique : pas de pré-rendu (le secret ne doit pas être
// mis en cache CDN ni dans le static cache Next).
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function MfaEnrollPage({ params }: PageProps) {
  const { locale } = await params;

  const session = await auth();
  if (!session?.user) {
    redirect(`/${toUrlLocale(locale)}/login`);
  }

  const result = await startEnrollmentAction();

  if (result.kind === 'already_enrolled') {
    // Déjà enrôlé — on redirige vers le tableau de bord (qui à terme
    // exigera step-up MFA — pour 005 phase 3, on redirige juste vers /).
    redirect(`/${toUrlLocale(locale)}`);
  }

  if (result.kind === 'rate_limited') {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-6 text-red-900">
        <h2 className="mb-2 text-lg font-semibold">Trop de tentatives</h2>
        <p>
          Vous avez démarré trop de flows d'enrôlement récemment. Réessayez après{' '}
          <strong>{result.unlockAt || 'quelques minutes'}</strong>. Si le problème persiste,
          contactez le support.
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

  // Génère le QR code en data URL (SVG en string, encodé base64 inline).
  // Côté serveur uniquement — le secret est dans keyUri.
  const qrCodeDataUrl = await QRCode.toDataURL(result.qrCodeKeyUri, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200,
  });

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold">Activez votre authentification multi-facteur</h2>
      <p className="mb-8 text-slate-600">
        Suivez les 3 étapes ci-dessous pour protéger votre compte. Une fois activé, un code à 6
        chiffres vous sera demandé à chaque connexion.
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
