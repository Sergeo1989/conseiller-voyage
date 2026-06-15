// T007 [US1] — Liste de mes leads (RSC). Lien vers le détail. État vide accessible.

import { type Locale, toUrlLocale } from '@/i18n';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { LeadView } from '../schemas/lead';
import { BriefSummary } from './BriefSummary';
import { LeadStatusBadge } from './LeadStatusBadge';

export function LeadList({ leads, locale }: { leads: ReadonlyArray<LeadView>; locale: Locale }) {
  const t = useTranslations('leads');
  const urlLocale = toUrlLocale(locale);

  if (leads.length === 0) {
    return (
      <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-600">
        {t('empty')}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {leads.map((lead) => (
        <li key={lead.id}>
          <Link
            href={`/${urlLocale}/conseiller/leads/${lead.id}`}
            className="block rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{t('position', { n: lead.position })}</span>
              <LeadStatusBadge state={lead.currentState} />
            </div>
            <BriefSummary brief={lead.brief} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
