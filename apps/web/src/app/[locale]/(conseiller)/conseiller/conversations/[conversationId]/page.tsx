// T014 [US3] — Page d'un fil (RSC). Monte ConversationThread (slice 013) avec
// l'entête `writable` + messages + pièces jointes. Lecture seule si non writable.
// Active le test a11y conversation.spec.ts (route montée).

import { ConversationThread, getThread } from '@/features/conversation';
import { type Locale, toUrlLocale } from '@/i18n';
import { requireConseiller } from '@/shared/auth';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ locale: Locale; conversationId: string }>;
}

export default async function ConversationThreadPage({ params }: PageProps) {
  const { locale, conversationId } = await params;
  await requireConseiller({ locale });
  const t = await getTranslations({ locale, namespace: 'conversation' });
  const thread = await getThread(conversationId);
  if (!thread) notFound();

  const urlLocale = toUrlLocale(locale);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href={`/${urlLocale}/conseiller/conversations`}
        className="text-sm text-blue-700 hover:underline"
      >
        ← {t('listTitle')}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-bold text-slate-900">{t('threadTitle')}</h1>
      <ConversationThread
        conversation={{
          id: thread.conversation.id,
          leadId: thread.conversation.leadId,
          conseillerId: '',
          briefId: null,
          writable: thread.conversation.writable,
          openedAt: new Date(thread.conversation.openedAt),
          lastMessageAt: thread.conversation.lastMessageAt
            ? new Date(thread.conversation.lastMessageAt)
            : null,
        }}
        messages={thread.items.map((m) => ({
          id: m.id,
          author: m.author,
          body: m.body,
          createdAt: new Date(m.createdAt),
          attachments: m.attachments,
        }))}
        viewer="conseiller"
      />
    </main>
  );
}
