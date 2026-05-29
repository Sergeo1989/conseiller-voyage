// T085 — BriefStatusBadge.
// Affiche un badge couleur par statut. Contraste ≥ 4.5:1 sur fond clair
// pour conformité WCAG 2.1 AA (Principe XI).

import type { BriefStatus } from '@cv/shared/intake';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface BriefStatusBadgeProps {
  readonly status: BriefStatus;
}

const STATUS_STYLES: Record<BriefStatus, string> = {
  pending_verification: 'bg-amber-100 text-amber-900 border-amber-300',
  active: 'bg-green-100 text-green-900 border-green-300',
  matched: 'bg-blue-100 text-blue-900 border-blue-300',
  expired_unverified: 'bg-gray-100 text-gray-700 border-gray-300',
  expired: 'bg-gray-100 text-gray-700 border-gray-300',
  deleted: 'bg-red-100 text-red-900 border-red-300',
  anonymized: 'bg-red-100 text-red-900 border-red-300',
};

export function BriefStatusBadge({ status }: BriefStatusBadgeProps): ReactNode {
  const t = useTranslations('intake.recap');
  const label = labelForStatus(status, t);
  const classes = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${classes}`}
      data-status={status}
    >
      {label}
    </span>
  );
}

function labelForStatus(status: BriefStatus, t: (key: string) => string): string {
  if (status === 'active' || status === 'pending_verification') return t('statusActive');
  if (status === 'matched') return t('statusMatched');
  if (status === 'expired' || status === 'expired_unverified') return t('statusExpired');
  return t('statusDeleted');
}
