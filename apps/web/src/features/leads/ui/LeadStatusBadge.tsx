// T006 [US1] — Badge de statut de lead. Libellé textuel (jamais couleur seule, a11y).

import { useTranslations } from 'next-intl';
import type { LeadState } from '../schemas/lead';

const STYLE: Record<LeadState, string> = {
  envoye: 'bg-slate-100 text-slate-700',
  vu: 'bg-blue-100 text-blue-800',
  accepte: 'bg-emerald-100 text-emerald-800',
  devis_envoye: 'bg-indigo-100 text-indigo-800',
  reservation_confirmee: 'bg-teal-100 text-teal-800',
  refuse: 'bg-rose-100 text-rose-800',
  perdu: 'bg-gray-200 text-gray-700',
};

export function LeadStatusBadge({ state }: { state: LeadState }) {
  const t = useTranslations('leads');
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLE[state]}`}
    >
      {t(`status.${state}`)}
    </span>
  );
}
