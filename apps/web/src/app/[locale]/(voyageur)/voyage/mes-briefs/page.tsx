// T089 — Page voyageur /voyage/mes-briefs (FR-017).
// Liste les briefs actifs du contact connecté via cookie session voyageur.

import { BriefStatusBadge, fetchBriefsByEmail } from '@/features/intake';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface PageProps {
  readonly params: Promise<{ locale: string }>;
}

export default async function MesBriefsPage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const localeKey = locale === 'en' ? 'en' : 'fr';
  const t = await getTranslations({ locale, namespace: 'intake.recap' });

  const result = await fetchBriefsByEmail();
  if (!result.ok) {
    redirect(`/${localeKey}/voyage/lien-expire`);
  }

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t('otherBriefsLink')}</h1>

      {result.briefs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noMatchYet')}</p>
      ) : (
        <ul className="space-y-3">
          {result.briefs.map((brief) => {
            const submitted = new Date(brief.submittedAt).toLocaleDateString(
              localeKey === 'en' ? 'en' : 'fr-CA',
            );
            return (
              <li key={brief.briefId} className="rounded border p-4">
                <div className="flex items-center justify-between">
                  <Link
                    href={`/${localeKey}/voyage/${brief.briefId}`}
                    className="font-medium underline decoration-1 underline-offset-2"
                  >
                    {brief.destinations.map((d) => d.country).join(' · ')}
                  </Link>
                  <BriefStatusBadge status={brief.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('submittedOn', { date: submitted })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
