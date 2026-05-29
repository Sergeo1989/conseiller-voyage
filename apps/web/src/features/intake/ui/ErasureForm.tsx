// T109 — ErasureForm (Client Component, FR-022).
//
// Input confirmation + bouton désactivé tant que la phrase ne match pas
// exactement. Anti-erreur : impossible de soumettre par mégarde.

'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState, useTransition } from 'react';
import { requestBriefErasureAction } from '../actions/request-brief-erasure.action';
import { ERASURE_BRIEF_PHRASE } from '../schemas';

interface ErasureFormProps {
  readonly briefId: string;
  readonly locale: 'fr' | 'en';
}

export function ErasureForm({ briefId, locale }: ErasureFormProps): ReactNode {
  const t = useTranslations('intake.erase');
  const router = useRouter();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const phraseMatches = confirmation === ERASURE_BRIEF_PHRASE;

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!phraseMatches) return;
    setError(null);
    startTransition(async () => {
      const result = await requestBriefErasureAction(briefId, confirmation);
      if (result.ok) {
        router.push(`/${locale}/voyage/supprime`);
        return;
      }
      setError(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-destructive">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <fieldset className="rounded border border-destructive/40 bg-destructive/5 p-4">
        <legend className="px-2 text-sm font-medium text-destructive">{t('phraseLabel')}</legend>
        <p className="mb-2 text-xs text-muted-foreground">
          {t('phraseHint', { phrase: ERASURE_BRIEF_PHRASE })}
        </p>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.currentTarget.value)}
          className="w-full rounded border bg-background px-3 py-2 font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="phrase-help"
        />
        <p id="phrase-help" className="mt-1 text-xs text-muted-foreground" aria-live="polite">
          {phraseMatches ? '✓' : `${confirmation.length}/${ERASURE_BRIEF_PHRASE.length}`}
        </p>
      </fieldset>

      {error && (
        <output
          className="block rounded border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
          aria-live="assertive"
        >
          {error}
        </output>
      )}

      <button
        type="submit"
        disabled={!phraseMatches || isPending}
        className="rounded bg-destructive px-6 py-2 text-sm font-semibold text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? '…' : t('submitButton')}
      </button>
    </form>
  );
}
