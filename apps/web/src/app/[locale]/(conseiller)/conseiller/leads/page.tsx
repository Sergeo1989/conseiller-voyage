// T007 [US1] — Page « Mes leads » (RSC, espace privé). Liste paginée des leads
// du conseiller courant. noindex hérité du layout (conseiller).

import { LeadList, listLeads } from '@/features/leads';
import type { Locale } from '@/i18n';
import { requireConseiller } from '@/shared/auth';
import { getTranslations } from 'next-intl/server';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function LeadsPage({ params }: PageProps) {
  const { locale } = await params;
  await requireConseiller({ locale });
  const t = await getTranslations({ locale, namespace: 'leads' });
  const { items } = await listLeads({ page: 1, pageSize: 20 });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
      <p className="mt-1 text-slate-600">{t('subtitle')}</p>
      <div className="mt-6">
        <LeadList leads={items} locale={locale} />
      </div>
    </main>
  );
}
