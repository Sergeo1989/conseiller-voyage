// T115f — EraseAllDataForm (Client Component, FR-022a, C1).
//
// Effacement global. Affiche le nombre de briefs concernés (passé en prop
// depuis le Server Component qui a fetché /api/intake/briefs/by-email).
// Phrase distincte de FR-022 (Q4).

'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState, useTransition } from 'react';
import { eraseAllVoyageurDataAction } from '../actions/erase-all-voyageur-data.action';
import { ERASURE_ALL_PHRASE } from '../schemas';

interface EraseAllDataFormProps {
  readonly activeBriefCount: number;
  readonly locale: 'fr' | 'en';
}

export function EraseAllDataForm({ activeBriefCount, locale }: EraseAllDataFormProps): ReactNode {
  const t = useTranslations('intake.eraseAll');
  const router = useRouter();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const phraseMatches = confirmation === ERASURE_ALL_PHRASE;

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!phraseMatches) return;
    setError(null);
    startTransition(async () => {
      const result = await eraseAllVoyageurDataAction(confirmation, activeBriefCount);
      if (result.ok) {
        router.push(`/${locale}/voyage/mes-donnees/effacee`);
        return;
      }
      if (result.code === 'STALE_BRIEF_COUNT' && result.actualCount !== undefined) {
        setError(
          `${result.message} (Nombre actuel : ${result.actualCount}, vous en attendiez ${activeBriefCount}).`,
        );
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-destructive">{t('title')}</h1>
        <p className="mt-2 text-sm" aria-live="polite">
          {t('subtitle', { count: activeBriefCount })}
        </p>
      </header>

      <fieldset className="rounded border border-destructive/40 bg-destructive/5 p-4">
        <legend className="px-2 text-sm font-medium text-destructive">{t('phraseLabel')}</legend>
        <p className="mb-2 text-xs text-muted-foreground">
          {t('phraseHint', { phrase: ERASURE_ALL_PHRASE })}
        </p>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.currentTarget.value)}
          className="w-full rounded border bg-background px-3 py-2 font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
          aria-label={t('phraseLabel')}
          aria-describedby="phrase-help-all"
        />
        <p id="phrase-help-all" className="mt-1 text-xs text-muted-foreground" aria-live="polite">
          {phraseMatches ? '✓' : `${confirmation.length}/${ERASURE_ALL_PHRASE.length}`}
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
