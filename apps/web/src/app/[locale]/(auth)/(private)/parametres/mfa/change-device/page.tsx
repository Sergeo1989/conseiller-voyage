// Server Component /parametres/mfa/change-device (US6).

import { DeviceChangeForm } from '@/features/mfa/ui/DeviceChangeForm';
import { redirect } from 'next/navigation';
import { auth } from '../../../../../../../auth';
import { toUrlLocale } from '../../../../../../../i18n';

export const metadata = {
  title: "Changer d'appareil MFA — Conseiller Voyage",
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function DeviceChangePage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/${toUrlLocale(locale)}/login`);
  }

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold">Changer de device TOTP</h2>
      <p className="mb-6 text-slate-600">
        Pour migrer vers un nouveau téléphone ou gestionnaire de mots de passe. Cette action est
        atomique : votre ancien secret + tous vos backup codes sont supprimés immédiatement, puis un
        nouveau secret pending est créé. Vous devrez finaliser l'enrôlement (scan QR + 1er code
        TOTP) avant de pouvoir vous reconnecter ailleurs.
      </p>
      <DeviceChangeForm />
    </div>
  );
}
