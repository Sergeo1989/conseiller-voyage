// T127 (M7) — Page admin /admin/intake/[briefId] (US5 FR-027).
// Server Component MINCE → AdminBriefDetail via barrel @/features/intake-admin.

import { AdminBriefDetail, fetchAdminBriefDetail } from '@/features/intake-admin';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface PageProps {
  readonly params: Promise<{ locale: string; briefId: string }>;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Brief admin | Détail',
};

export default async function AdminBriefDetailPage({ params }: PageProps): Promise<ReactNode> {
  const { locale, briefId } = await params;
  const localeKey = locale === 'en' ? 'en' : 'fr';

  const result = await fetchAdminBriefDetail(briefId);
  if (!result.ok) {
    if (result.status === 401) redirect(`/${localeKey}/login`);
    if (result.status === 404) notFound();
    redirect(`/${localeKey}/admin/intake/non-matche`);
  }
  if (!result.data) notFound();

  return (
    <main className="container mx-auto max-w-3xl px-4 py-8">
      <AdminBriefDetail summary={result.data} locale={localeKey} />
    </main>
  );
}
