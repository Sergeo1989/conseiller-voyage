// T013 [US3] — Liste de mes fils de conversation (RSC). Statut actif / lecture
// seule, dernier message, lien vers le fil. État vide accessible.

import { type Locale, toUrlLocale } from '@/i18n';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ConversationListItem } from '../api/conversations-api';

export function ConversationList({
  conversations,
  locale,
}: {
  conversations: ReadonlyArray<ConversationListItem>;
  locale: Locale;
}) {
  const t = useTranslations('conversation');
  const format = useFormatter();
  const urlLocale = toUrlLocale(locale);

  if (conversations.length === 0) {
    return (
      <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-center text-slate-600">
        {t('listEmpty')}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link
            href={`/${urlLocale}/conseiller/conversations/${c.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-blue-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <span className="text-sm text-slate-700">
              {c.lastMessageAt ? (
                <>
                  {t('lastMessage')} :{' '}
                  <time dateTime={c.lastMessageAt}>
                    {format.dateTime(new Date(c.lastMessageAt))}
                  </time>
                </>
              ) : (
                t('noMessages')
              )}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                c.writable ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {c.writable ? t('active') : t('readOnlyBadge')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
