// Server Component /parametres/mfa/regenerate-codes (US6).
// Action côté API exige step-up MFA — si la session n'est pas fresh,
// le Server Action retourne stepup_required et le Client affiche un
// message pointant vers le modal step-up qui sera intégré quand
// l'orchestrator step-up sera en place dans le layout privé.

import { RegenerateCodesForm } from '@/features/mfa/ui/RegenerateCodesForm';
import { redirect } from 'next/navigation';
import { auth } from '../../../../../../../auth';
import { toUrlLocale } from '../../../../../../../i18n';

export const metadata = {
  title: 'Régénérer les codes de récupération — Conseiller Voyage',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function RegenerateCodesPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/${toUrlLocale(locale)}/login`);
  }

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold">Régénérer vos codes de récupération</h2>
      <p className="mb-6 text-slate-600">
        Cette action <strong>invalide immédiatement tous vos codes actuels</strong> (consommés et
        non consommés) et génère un nouveau lot de 10 codes. Vous devrez sauvegarder les nouveaux
        codes — ils ne seront plus jamais ré-affichés.
      </p>
      <RegenerateCodesForm />
    </div>
  );
}
