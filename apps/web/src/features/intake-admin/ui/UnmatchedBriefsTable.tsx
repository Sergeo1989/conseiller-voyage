// T122 — UnmatchedBriefsTable (Server Component).
// Table accessible (caption + th scope) listant les briefs unmatched.

import type { BriefSummary } from '@cv/shared/intake';
import { formatSpeciality } from '@cv/shared/intake';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface UnmatchedBriefsTableProps {
  readonly items: ReadonlyArray<BriefSummary>;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly locale: 'fr' | 'en';
}

export function UnmatchedBriefsTable({
  items,
  total,
  page,
  pageSize,
  locale,
}: UnmatchedBriefsTableProps): ReactNode {
  const formatterLocale = locale === 'en' ? 'en' : 'fr-CA';
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section>
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Briefs non matchés</h1>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {total} brief{total > 1 ? 's' : ''} en attente
        </p>
      </header>

      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Liste des briefs voyageurs actifs depuis plus de 4 heures sans aucun conseiller notifié.
        </caption>
        <thead className="border-b">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Destinations
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Spécialité
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Soumis le
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Vérifié le
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                Aucun brief unmatched.
              </td>
            </tr>
          ) : (
            items.map((brief) => (
              <tr key={brief.briefId} className="border-b hover:bg-muted/30">
                <td className="px-3 py-2">
                  {brief.destinations.map((d) => d.country).join(' · ')}
                </td>
                <td className="px-3 py-2">{formatSpeciality(brief.speciality, formatterLocale)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {new Date(brief.submittedAt).toLocaleDateString(formatterLocale)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {brief.verifiedAt
                    ? new Date(brief.verifiedAt).toLocaleDateString(formatterLocale)
                    : '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/${locale}/admin/intake/${brief.briefId}`}
                    className="text-sm font-medium text-primary underline decoration-1 underline-offset-2"
                  >
                    Examiner
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <nav className="mt-4 flex justify-center gap-2" aria-label="Pagination">
          {page > 1 && (
            <Link
              href={`?page=${page - 1}`}
              className="rounded border px-3 py-1 text-sm hover:bg-muted"
            >
              ← Précédent
            </Link>
          )}
          <span className="px-3 py-1 text-sm text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`?page=${page + 1}`}
              className="rounded border px-3 py-1 text-sm hover:bg-muted"
            >
              Suivant →
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
