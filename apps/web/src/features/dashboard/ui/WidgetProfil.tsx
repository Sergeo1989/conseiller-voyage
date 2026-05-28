// T100 — Widget Profil (feature 007 US3 + FR-012a).

import type { ProfilPriveDto } from '@/features/profil-conseiller/actions/profil.actions';
import Link from 'next/link';

interface WidgetProfilProps {
  readonly profil: ProfilPriveDto | null;
  readonly locale: string;
}

export function WidgetProfil({ profil, locale }: WidgetProfilProps) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Mon profil</h2>
      <ProfilStatutContent profil={profil} />
      <ProfilLinks profil={profil} locale={locale} />
    </article>
  );
}

function ProfilStatutContent({ profil }: { profil: ProfilPriveDto | null }) {
  if (!profil) {
    return <p className="mt-3 text-sm text-slate-600">Profil non encore créé.</p>;
  }
  if (profil.statut === 'pret') {
    return <p className="mt-3 text-sm text-emerald-700">Prêt — visible publiquement</p>;
  }
  if (profil.statut === 'masque_admin') {
    return (
      <p className="mt-3 text-sm text-orange-700">Masqué temporairement par un administrateur</p>
    );
  }
  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-amber-700">Profil incomplet</p>
      <p className="mt-1 text-xs text-slate-600">
        Votre page publique n&apos;est pas en ligne et vous n&apos;apparaissez dans aucun matching.
      </p>
      {profil.champsManquants.length > 0 && (
        <p className="mt-1 text-xs text-slate-600">
          À compléter : <strong>{profil.champsManquants.join(', ')}</strong>
        </p>
      )}
    </div>
  );
}

function ProfilLinks({ profil, locale }: { profil: ProfilPriveDto | null; locale: string }) {
  return (
    <div className="mt-4 flex flex-col gap-1 text-sm">
      <Link
        href={`/${locale}/conseiller/profil`}
        className="font-medium text-blue-700 underline hover:text-blue-900"
      >
        {profil?.statut === 'pret' ? 'Modifier mon profil →' : 'Compléter mon profil →'}
      </Link>
      {profil?.slug && (
        <Link
          href={`/${locale}/conseiller/${profil.slug}`}
          className="text-blue-700 underline hover:text-blue-900"
        >
          Voir ma page publique →
        </Link>
      )}
    </div>
  );
}
