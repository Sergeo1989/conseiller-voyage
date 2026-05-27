// Server Component /parametres/mfa (US6) — page principale paramètres MFA.
//
// Affiche un résumé non-sensible (P1-4 split /me/summary) + 2 actions :
//   - Changer de device (route /change-device)
//   - Régénérer codes de récupération (route /regenerate-codes,
//     step-up requis côté API)

import { prisma } from '@cv/db';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '../../../../../../auth';
import { toUrlLocale } from '../../../../../../i18n';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function MfaParametresPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/${toUrlLocale(locale)}/login`);
  }

  // Summary non-sensible : enabled + enrolledAt seulement (P1-4).
  const active = await prisma.mfaSecret.findFirst({
    where: { userId: session.user.id, enabledAt: { not: null } },
    select: { enrolledAt: true, lastUsedAt: true },
  });

  if (!active) {
    return (
      <div className="rounded border border-slate-300 bg-slate-50 p-6">
        <h2 className="mb-2 text-lg font-semibold">Aucun MFA actif</h2>
        <p className="mb-4 text-sm text-slate-700">
          Vous n'avez pas encore activé l'authentification multi-facteur.
        </p>
        <Link
          href={`/${toUrlLocale(locale)}/mfa/enroll`}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
        >
          Activer MFA maintenant
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-xl font-semibold">Paramètres MFA</h2>
        <p className="text-slate-600">
          Gestion de votre authentification multi-facteur. Pour des raisons de sécurité, certaines
          actions exigent que votre session soit récemment validée (&lt; 30 min).
        </p>
      </div>

      <section className="rounded border border-slate-200 bg-white p-6">
        <h3 className="mb-3 text-lg font-semibold">État</h3>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <dt className="font-medium text-slate-600">Méthode active</dt>
          <dd>TOTP (Time-based One-Time Password)</dd>
          <dt className="font-medium text-slate-600">Activé depuis</dt>
          <dd>{active.enrolledAt.toLocaleString('fr-CA')}</dd>
          <dt className="font-medium text-slate-600">Dernière utilisation</dt>
          <dd>{active.lastUsedAt?.toLocaleString('fr-CA') ?? 'jamais'}</dd>
        </dl>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold">Actions disponibles</h3>

        <article className="rounded border border-slate-200 bg-white p-6">
          <h4 className="mb-2 font-medium">Changer de device TOTP</h4>
          <p className="mb-4 text-sm text-slate-600">
            Vous avez changé de téléphone ou migré vers un autre gestionnaire de mots de passe ?
            Cette opération invalide votre ancien secret et démarre un nouvel enrôlement.
            Re-authentification (mot de passe + code TOTP courant OU code de récupération) requise.
          </p>
          <Link
            href={`/${toUrlLocale(locale)}/parametres/mfa/change-device`}
            className="inline-block rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          >
            Changer de device
          </Link>
        </article>

        <article className="rounded border border-slate-200 bg-white p-6">
          <h4 className="mb-2 font-medium">Régénérer vos codes de récupération</h4>
          <p className="mb-4 text-sm text-slate-600">
            Invalidez immédiatement tous vos codes de récupération existants (consommés et non
            consommés) et générez un nouveau lot de 10 codes. Action sensible — step-up MFA exigé.
          </p>
          <Link
            href={`/${toUrlLocale(locale)}/parametres/mfa/regenerate-codes`}
            className="inline-block rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Régénérer les codes
          </Link>
        </article>
      </section>
    </div>
  );
}
