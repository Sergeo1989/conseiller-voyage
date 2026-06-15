// T008 [US1/US2] — Page détail d'un lead (RSC). Aperçu non nominatif + actions
// de transition + historique. 404 si introuvable / non propriétaire.

import { LeadDetail, getLead } from '@/features/leads';
import { type Locale, toUrlLocale } from '@/i18n';
import { requireConseiller } from '@/shared/auth';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ locale: Locale; leadId: string }>;
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { locale, leadId } = await params;
  await requireConseiller({ locale });
  const t = await getTranslations({ locale, namespace: 'leads' });
  const lead = await getLead(leadId);
  if (!lead) notFound();

  const urlLocale = toUrlLocale(locale);
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/${urlLocale}/conseiller/leads`}
        className="text-sm text-blue-700 hover:underline"
      >
        ← {t('backToList')}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-bold text-slate-900">{t('title')}</h1>
      <LeadDetail lead={lead} locale={locale} />
    </main>
  );
}
