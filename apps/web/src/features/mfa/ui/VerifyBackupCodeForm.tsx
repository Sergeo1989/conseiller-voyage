'use client';

// VerifyBackupCodeForm — Client Component pour /mfa/recovery (US3).
//
// Input format XXXX-XXXX-XX avec normalisation côté Client (majuscules
// + tiret auto). Submit → Server Action. Sur ok → redirect home, et
// affiche un toast si warnLowCodes.

import { verifyBackupCodeAction } from '@/features/mfa';
import { toUrlLocale } from '@/i18n';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';

function normalizeInput(raw: string): string {
  // Force majuscules, ne garde que A-Z + 2-9 (alphabet du code), puis
  // ré-insère les tirets aux positions 4 et 8.
  const clean = raw
    .toUpperCase()
    .replace(/[^A-HJ-KM-NP-Z2-9]/g, '')
    .slice(0, 10);
  if (clean.length <= 4) return clean;
  if (clean.length <= 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8)}`;
}

export function VerifyBackupCodeForm() {
  const locale = useLocale();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warnMessage, setWarnMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = code.length === 12 && !isPending; // XXXX-XXXX-XX = 12 chars

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setWarnMessage(null);
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher 4 cas + warnLow
    startTransition(async () => {
      const formData = new FormData();
      formData.set('backupCode', code);
      const result = await verifyBackupCodeAction(formData);

      if (result.kind === 'ok') {
        if (result.warnLowCodes) {
          setWarnMessage(
            `Il vous reste ${result.remainingCount} codes de récupération. Pensez à les régénérer depuis vos paramètres.`,
          );
          // Redirect avec petit délai pour que l'utilisateur voie le message.
          setTimeout(() => router.push(`/${toUrlLocale(locale)}`), 2500);
        } else {
          router.push(`/${toUrlLocale(locale)}`);
        }
        return;
      }
      if (result.kind === 'invalid') {
        setError(
          result.attemptsRemaining > 0
            ? `Ce code est invalide ou a déjà été utilisé. ${result.attemptsRemaining} tentative${
                result.attemptsRemaining > 1 ? 's' : ''
              } restante${result.attemptsRemaining > 1 ? 's' : ''}.`
            : 'Ce code est invalide ou a déjà été utilisé.',
        );
        setCode('');
        return;
      }
      if (result.kind === 'locked') {
        const date = new Date(result.unlockAt);
        setError(
          `Votre compte est temporairement verrouillé. Réessayez après ${date.toLocaleTimeString('fr-CA')}.`,
        );
        return;
      }
      setError('Erreur inattendue. Réessayez ou contactez le support.');
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p id="recovery-code-help" className="text-sm text-slate-600">
        Saisissez l'un de vos 10 codes de récupération (format <code>XXXX-XXXX-XX</code>). Chaque
        code n'est utilisable qu'une seule fois.
      </p>
      <div>
        <label htmlFor="recovery-code-input" className="sr-only">
          Code de récupération
        </label>
        <input
          id="recovery-code-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          placeholder="ABCD-EFGH-JK"
          value={code}
          onChange={(e) => setCode(normalizeInput(e.target.value))}
          disabled={isPending}
          aria-describedby="recovery-code-help"
          className="block w-full max-w-xs rounded border border-slate-300 bg-white px-3 py-2 font-mono text-lg tracking-wider focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-100"
        />
      </div>
      {warnMessage && (
        <output className="block rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {warnMessage}
        </output>
      )}
      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-between">
        <Link
          href={`/${toUrlLocale(locale)}/mfa/verify`}
          className="text-sm text-slate-600 underline hover:text-slate-900"
        >
          Retour au code TOTP
        </Link>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? 'Vérification…' : 'Se connecter'}
        </button>
      </div>
    </form>
  );
}
