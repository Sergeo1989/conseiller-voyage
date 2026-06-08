// T008 [US1/US2] — Détail d'un lead (RSC) : aperçu non nominatif, statut,
// actions valides (client), historique horodaté. Lien vers la conversation
// quand un fil existe (post-acceptation).

import { type Locale, toUrlLocale } from '@/i18n';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import type { LeadView } from '../schemas/lead';
import { BriefSummary } from './BriefSummary';
import { LeadActions } from './LeadActions';
import { LeadStatusBadge } from './LeadStatusBadge';

const POST_ACCEPT = new Set(['accepte', 'devis_envoye', 'reservation_confirmee']);

export function LeadDetail({ lead, locale }: { lead: LeadView; locale: Locale }) {
  const t = useTranslations('leads');
  const format = useFormatter();
  const urlLocale = toUrlLocale(locale);

  return (
    <article className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500">{t('position', { n: lead.position })}</span>
        <LeadStatusBadge state={lead.currentState} />
      </header>

      <section aria-label={t('briefTitle')} className="rounded-lg border border-slate-200 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('briefTitle')}</h2>
        <BriefSummary brief={lead.brief} />
      </section>

      <section aria-label="actions">
        <LeadActions leadId={lead.id} currentState={lead.currentState} />
      </section>

      {POST_ACCEPT.has(lead.currentState) && (
        <Link
          href={`/${urlLocale}/conseiller/conversations`}
          className="inline-flex w-fit items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t('openConversation')}
        </Link>
      )}

      <section aria-label={t('historyTitle')}>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">{t('historyTitle')}</h2>
        <ol className="flex flex-col gap-1 text-sm text-slate-600">
          {lead.history.map((h) => (
            <li key={`${h.toState}-${h.occurredAt}`} className="flex items-center gap-2">
              <time dateTime={h.occurredAt}>{format.dateTime(new Date(h.occurredAt))}</time>
              <span>·</span>
              <span>{t(`status.${h.toState}`)}</span>
              <span className="text-slate-400">({t(`by.${h.actor}`)})</span>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
