// T034 [Polish] — Fil de conversation (RSC). Compose la mention permanente
// anti-transaction, la liste des messages et le composeur (masqué si le fil est
// en lecture seule). UI minimale consommée par 014 (dashboard conseiller) /
// 015 (espace voyageur), qui fournissent les données via ConversationQueryPort.

import type { ConversationView, MessageView } from '@cv/shared/matching';
import { useTranslations } from 'next-intl';
import { AntiTransactionNotice } from './AntiTransactionNotice';
import { MessageComposer } from './MessageComposer';
import { MessageList } from './MessageList';

interface ConversationThreadProps {
  readonly conversation: ConversationView;
  readonly messages: ReadonlyArray<MessageView>;
  readonly viewer: 'conseiller' | 'voyageur';
}

export function ConversationThread({ conversation, messages, viewer }: ConversationThreadProps) {
  const t = useTranslations('conversation');
  return (
    <section className="flex flex-col gap-4" aria-label={t('threadTitle')}>
      <AntiTransactionNotice />
      <MessageList messages={messages} viewer={viewer} />
      {conversation.writable ? (
        <MessageComposer conversationId={conversation.id} />
      ) : (
        <p className="text-sm text-gray-500 italic">{t('readOnly')}</p>
      )}
    </section>
  );
}
