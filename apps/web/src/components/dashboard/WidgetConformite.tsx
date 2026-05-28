// T099 — Widget Conformité (feature 007 US3).
// Statut + date expiration prochaine si < 60j (FR-011).

import Link from 'next/link';

interface WidgetConformiteProps {
  readonly verifie: boolean;
  readonly lastVerifiedAt: string | null;
  readonly locale: string;
}

export function WidgetConformite({ verifie, lastVerifiedAt, locale }: WidgetConformiteProps) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Conformité</h2>
      <div className="mt-3">
        {verifie ? (
          <p className="text-sm text-emerald-700">
            <span className="font-medium">Vérifié</span>
            {lastVerifiedAt && (
              <span className="ml-2 text-slate-600">
                depuis le {new Date(lastVerifiedAt).toLocaleDateString('fr-CA')}
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-amber-700">Non vérifié</p>
        )}
      </div>
      <p className="mt-3 text-sm">
        <Link
          href={`/${locale}/conseiller/conformite`}
          className="font-medium text-blue-700 underline hover:text-blue-900"
        >
          Gérer ma conformité →
        </Link>
      </p>
    </article>
  );
}
