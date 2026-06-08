// T034 [Polish] — Mention permanente anti-marketplace (ADR-0002, Principe I).
// Toujours visible dans le fil : la plateforme ne participe pas à la transaction.

import { useTranslations } from 'next-intl';

export function AntiTransactionNotice() {
  const t = useTranslations('conversation');
  return (
    <aside
      role="note"
      aria-label={t('antiTransaction')}
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      {t('antiTransaction')}
    </aside>
  );
}
