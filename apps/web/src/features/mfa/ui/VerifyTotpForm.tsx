'use client';

// VerifyTotpForm — Client Component pour /mfa/verify (US3).
//
// Submit le code TOTP via Server Action. Sur succès → redirect home.
// Sur invalid → message + retry. Sur locked → message avec unlockAt.

import { verifyTotpAction } from '@/features/mfa/actions/verify.actions';
import { toUrlLocale } from '@/i18n';
import { useLocale } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { TotpInput } from './TotpInput';

export interface VerifyTotpFormProps {
  readonly returnUrl?: string;
}

export function VerifyTotpForm({ returnUrl }: VerifyTotpFormProps) {
  const locale = useLocale();
  const router = useRouter();
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (totpCode.length !== 6 || isPending) return;
    setError(null);
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher 4 cas
    startTransition(async () => {
      const formData = new FormData();
      formData.set('totpCode', totpCode);
      const result = await verifyTotpAction(formData);

      if (result.kind === 'ok') {
        router.push(returnUrl ?? `/${toUrlLocale(locale)}`);
        return;
      }
      if (result.kind === 'invalid') {
        setError(
          result.attemptsRemaining > 0
            ? `Code invalide. ${result.attemptsRemaining} tentative${
                result.attemptsRemaining > 1 ? 's' : ''
              } restante${result.attemptsRemaining > 1 ? 's' : ''}.`
            : 'Code invalide.',
        );
        setTotpCode('');
        return;
      }
      if (result.kind === 'locked') {
        const date = new Date(result.unlockAt);
        setError(
          `Votre compte est temporairement verrouillé suite à plusieurs échecs. Réessayez après ${date.toLocaleTimeString('fr-CA')}.`,
        );
        return;
      }
      setError('Erreur inattendue. Réessayez ou contactez le support.');
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p id="verify-totp-help" className="text-sm text-slate-600">
        Saisissez le code à 6 chiffres affiché par votre application TOTP.
      </p>
      <TotpInput
        value={totpCode}
        onChange={setTotpCode}
        disabled={isPending}
        autoFocus
        inputId="verify-totp-code"
        describedById="verify-totp-help"
      />
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
          href={`/${toUrlLocale(locale)}/mfa/recovery`}
          className="text-sm text-slate-600 underline hover:text-slate-900"
        >
          Utiliser un code de récupération
        </Link>
        <button
          type="submit"
          disabled={totpCode.length !== 6 || isPending}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? 'Vérification…' : 'Se connecter'}
        </button>
      </div>
    </form>
  );
}
