// T006 [US1] — Résumé NON nominatif d'un brief (destinations / période / type).
// Aucune PII de contact (Loi 25). `null` si anonymisé.

import { useTranslations } from 'next-intl';
import type { LeadBriefSummary } from '../schemas/lead';

export function BriefSummary({ brief }: { brief: LeadBriefSummary | null }) {
  const t = useTranslations('leads');
  if (!brief) {
    return <p className="text-sm text-slate-500 italic">{t('noBrief')}</p>;
  }
  return (
    <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-3">
      <div>
        <dt className="font-medium text-slate-600">{t('destinations')}</dt>
        <dd className="text-slate-900">
          {brief.destinations.length > 0 ? brief.destinations.join(', ') : '—'}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-slate-600">{t('periode')}</dt>
        <dd className="text-slate-900">{brief.periodeApprox}</dd>
      </div>
      <div>
        <dt className="font-medium text-slate-600">{t('type')}</dt>
        <dd className="text-slate-900">{brief.typeProjet}</dd>
      </div>
    </dl>
  );
}
