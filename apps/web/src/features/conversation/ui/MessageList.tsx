// T034 [Polish] — Liste ordonnée des messages d'un fil. Présentationnel (RSC).
// Corps `null` = message anonymisé (Loi 25) → rendu neutre. Sémantique de liste
// pour l'accessibilité (lecteur d'écran).

import type { MessageView } from '@cv/shared/matching';
import { useFormatter, useTranslations } from 'next-intl';
import { AttachmentLink } from './AttachmentLink';

interface MessageListProps {
  readonly messages: ReadonlyArray<MessageView>;
  /** Référence du lecteur courant pour marquer ses propres messages. */
  readonly viewer: 'conseiller' | 'voyageur';
}

export function MessageList({ messages, viewer }: MessageListProps) {
  const t = useTranslations('conversation');
  const format = useFormatter();

  if (messages.length === 0) {
    return <p className="text-sm text-gray-500">{t('emptyMessages')}</p>;
  }

  return (
    <ol className="flex flex-col gap-3" aria-label={t('threadTitle')}>
      {messages.map((m) => {
        const mine = m.author === viewer;
        const author = mine ? t('you') : m.author === 'conseiller' ? t('advisor') : t('traveler');
        return (
          <li
            key={m.id}
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              mine ? 'self-end bg-blue-600 text-white' : 'self-start bg-gray-100 text-gray-900'
            }`}
          >
            <p className="mb-0.5 text-xs opacity-80">
              {author} ·{' '}
              <time dateTime={m.createdAt.toISOString()}>{format.dateTime(m.createdAt)}</time>
            </p>
            <p>{m.body ?? '—'}</p>
            {m.attachments.length > 0 && (
              <ul className="mt-1 flex flex-col gap-0.5">
                {m.attachments.map((a) => (
                  <li key={a.id}>
                    <AttachmentLink attachment={a} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
