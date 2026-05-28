// T098 — Page Dashboard conseiller (feature 007 US3).
//
// Server Component sous auth. Affiche 4 widgets :
//   - Conformité (statut + date expiration prochaine si < 60j)
//   - Profil (statut + lien édition + avertissements FR-012/012a)
//   - Leads (placeholder — feature 012)
//   - Facturation (placeholder — feature 006-007)
//
// Pas d'index moteur (route privée).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '../../../auth';
import { WidgetConformite } from '../../../components/dashboard/WidgetConformite';
import { WidgetPlaceholder } from '../../../components/dashboard/WidgetPlaceholder';
import { WidgetProfil } from '../../../components/dashboard/WidgetProfil';
import { type Locale, toUrlLocale } from '../../../i18n';
import { lireProfilPriveAction } from '../../../lib/profil/server-actions';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/${toUrlLocale(locale)}/connexion`);
  }

  const profil = await lireProfilPriveAction();
  const urlLocale = toUrlLocale(locale);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold text-slate-900">Mon espace conseiller</h1>

      {profil?.statut === 'masque_admin' && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-orange-300 bg-orange-50 p-4 text-orange-900"
        >
          <p className="font-medium">Votre profil a été temporairement masqué.</p>
          {profil.raisonMasquageAdmin && (
            <p className="mt-1 text-sm">Raison : {profil.raisonMasquageAdmin}</p>
          )}
        </div>
      )}

      {!profil?.verifie && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900"
        >
          <p className="font-medium">
            Votre profil n&apos;est pas visible publiquement tant que votre conformité OPC/TICO
            n&apos;est pas vérifiée.
          </p>
          <p className="mt-2 text-sm">
            <Link
              href={`/${urlLocale}/conseiller/conformite`}
              className="font-medium text-blue-700 underline hover:text-blue-900"
            >
              Compléter ma conformité →
            </Link>
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <WidgetConformite
          verifie={profil?.verifie ?? false}
          lastVerifiedAt={profil?.lastVerifiedAt ?? null}
          locale={urlLocale}
        />
        <WidgetProfil profil={profil} locale={urlLocale} />
        <WidgetPlaceholder title="Mes leads" message="Bientôt disponible — feature 012." />
        <WidgetPlaceholder title="Mon abonnement" message="Bientôt disponible — feature 006-007." />
      </div>
    </main>
  );
}
