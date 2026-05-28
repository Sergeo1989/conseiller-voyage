// T065 — Page édition profil conseiller (feature 007 US1).
//
// Server Component qui :
//   1. Vérifie session via auth() — redirect /login si absente.
//   2. Charge le profil via lireProfilPriveAction.
//   3. Affiche un statut visible (incomplet / prêt / masqué_admin) avec
//      champs manquants si FR-012a.
//   4. Embarque le ProfilForm client (form édition + photo + toggle).
//
// Libellés FR-CA via next-intl. Pas d'index moteur (route privée).

import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '../../../../auth';
import { ProfilForm } from '../../../../components/profil/ProfilForm';
import type { Locale } from '../../../../i18n';
import { lireProfilPriveAction } from '../../../../lib/profil/server-actions';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function ProfilEditionPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale === 'fr-CA' ? 'fr' : 'en'}/connexion`);
  }

  const t = await getTranslations({ locale, namespace: 'profil.edition' });
  const profil = await lireProfilPriveAction();

  if (!profil) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-900">{t('pageTitre')}</h1>
        <p className="mt-4 text-slate-700">
          Profil indisponible. Veuillez réessayer dans quelques instants.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{t('pageTitre')}</h1>

      <ProfilStatutBanner statut={profil.statut} champsManquants={profil.champsManquants} />

      <ProfilForm initialData={profil} />
    </main>
  );
}

interface ProfilStatutBannerProps {
  readonly statut: 'incomplet' | 'pret' | 'masque_admin';
  readonly champsManquants: readonly string[];
}

function ProfilStatutBanner({ statut, champsManquants }: ProfilStatutBannerProps) {
  if (statut === 'pret') {
    return (
      <output className="mt-4 block rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
        <span className="font-medium">Profil prêt — visible publiquement</span>
      </output>
    );
  }

  if (statut === 'masque_admin') {
    return (
      <div
        role="alert"
        className="mt-4 rounded-md border border-orange-300 bg-orange-50 p-4 text-orange-900"
      >
        <p className="font-medium">Profil temporairement masqué par un administrateur.</p>
        <p className="mt-1 text-sm">
          Tant que votre profil est masqué, votre page publique n&apos;est pas en ligne et vous
          n&apos;apparaissez dans aucun matching.
        </p>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900"
    >
      <p className="font-medium">Profil incomplet</p>
      <p className="mt-1 text-sm">
        Votre page publique n&apos;est pas en ligne <strong>et</strong> vous n&apos;apparaissez dans
        aucun matching tant que votre profil n&apos;est pas complet.
      </p>
      {champsManquants.length > 0 && (
        <p className="mt-2 text-sm">
          À compléter : <strong>{champsManquants.join(', ')}</strong>
        </p>
      )}
    </div>
  );
}
