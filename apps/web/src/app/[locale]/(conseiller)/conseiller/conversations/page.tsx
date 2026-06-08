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
  const conversations = await listConversations();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">{t('listTitle')}</h1>
      <div className="mt-6">
        <ConversationList conversations={conversations} locale={locale} />
      </div>
    </main>
  );
}
