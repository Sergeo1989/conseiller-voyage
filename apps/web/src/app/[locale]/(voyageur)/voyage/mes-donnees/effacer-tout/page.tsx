// T115g — Page voyageur /voyage/mes-donnees/effacer-tout (FR-022a).
//
// Server Component : fetch by-email pour récupérer le count actuel,
// puis rend EraseAllDataForm avec ce count en prop.

import { EraseAllDataForm, fetchBriefsByEmail } from '@/features/intake';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface PageProps {
  readonly params: Promise<{ locale: string }>;
}

export default async function EraseAllDataPage({ params }: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const localeKey = locale === 'en' ? 'en' : 'fr';
  const result = await fetchBriefsByEmail();
  if (!result.ok) {
    redirect(`/${localeKey}/voyage/lien-expire`);
  }
  return (
    <main className="container mx-auto max-w-2xl px-4 py-8">
      <EraseAllDataForm activeBriefCount={result.briefs.length} locale={localeKey} />
    </main>
  );
}
