// T013 [US3] — Page « Mes conversations » (RSC, espace privé). Liste des fils
// du conseiller courant. noindex hérité du layout.

import { ConversationList, listConversations } from '@/features/conversation';
import type { Locale } from '@/i18n';
import { requireConseiller } from '@/shared/auth';
import { getTranslations } from 'next-intl/server';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export default async function ConversationsPage({ params }: PageProps) {
  const { locale } = await params;
  await requireConseiller({ locale });
  const t = await getTranslations({ locale, namespace: 'conversation' });
  const { items, error } = await listConversations();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{t('listTitle')}</h1>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {t('loadError')}
        </p>
      )}
      <div className="mt-6">
        <ConversationList conversations={items} locale={locale} />
      </div>
    </main>
  );
}
