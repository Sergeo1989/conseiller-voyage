// T034 [Polish] — Composeur de message (Client Component). Soumet via la Server
// Action `sendMessageAction`. Lecture seule masque le composeur. Accessibilité :
// label associé, erreurs en aria-live, bouton désactivé pendant l'envoi.

'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { sendMessageAction } from '../actions/send-message.action';
import { MAX_MESSAGE_LENGTH } from '../schemas/send-message.schema';

interface MessageComposerProps {
  readonly conversationId: string;
  readonly onSent?: () => void;
}

export function MessageComposer({ conversationId, onSent }: MessageComposerProps) {
  const t = useTranslations('conversation');
  const fieldId = useId();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      setError(t('messageEmpty'));
      return;
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setError(t('messageTooLong'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await sendMessageAction({ conversationId, body: trimmed });
      if (res.ok) {
        setBody('');
        onSent?.();
      } else {
        setError(res.error.message || t('sendError'));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-sm font-medium text-gray-700">
        {t('composerLabel')}
      </label>
      <textarea
        id={fieldId}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('composerPlaceholder')}
        maxLength={MAX_MESSAGE_LENGTH}
        rows={3}
        aria-invalid={error !== null}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {error && (
        <p id={`${fieldId}-error`} role="alert" aria-live="polite" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? t('sending') : t('send')}
        </button>
      </div>
    </form>
  );
}
