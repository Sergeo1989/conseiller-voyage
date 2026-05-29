// T126 (M7) — Page admin /admin/intake/non-matche (US5 FR-026).
// Server Component MINCE → UnmatchedBriefsTable via barrel @/features/intake-admin.

import { UnmatchedBriefsTable, fetchUnmatchedBriefs } from '@/features/intake-admin';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface PageProps {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ page?: string }>;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Briefs non matchés | Admin',
};

const PAGE_SIZE = 20;

export default async function NonMatchePage({
  params,
  searchParams,
}: PageProps): Promise<ReactNode> {
  const { locale } = await params;
  const { page: pageRaw } = await searchParams;
  const localeKey = locale === 'en' ? 'en' : 'fr';
  const page = Math.max(1, Number.parseInt(pageRaw ?? '1', 10) || 1);

  const result = await fetchUnmatchedBriefs({ page, pageSize: PAGE_SIZE });
  if (!result.ok || !result.data) {
    redirect(`/${localeKey}/login`);
  }

  return (
    <main className="container mx-auto max-w-5xl px-4 py-8">
      <UnmatchedBriefsTable
        items={result.data.items}
        total={result.data.total}
        page={result.data.page}
        pageSize={result.data.pageSize}
        locale={localeKey}
      />
    </main>
  );
}
