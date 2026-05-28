'use client';

// DeviceChangeForm — Client Component pour /parametres/mfa/change-device (US6).
// Saisie mot de passe + radio TOTP/backup code + input adaptatif.

import { startDeviceChangeAction } from '@/features/mfa';
import { toUrlLocale } from '@/i18n';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';

type FactorKind = 'totp' | 'backup_code';

function normalizeBackupInput(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-HJ-KM-NP-Z2-9]/g, '')
    .slice(0, 10);
  if (clean.length <= 4) return clean;
  if (clean.length <= 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8)}`;
}

export function DeviceChangeForm() {
  const locale = useLocale();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [factorKind, setFactorKind] = useState<FactorKind>('totp');
  const [factorCode, setFactorCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const factorLength = factorKind === 'totp' ? 6 : 12;
  const canSubmit = password.length >= 8 && factorCode.length === factorLength && !isPending;

  const handleFactorChange = (raw: string): void => {
    if (factorKind === 'totp') {
      setFactorCode(raw.replace(/\D/g, '').slice(0, 6));
    } else {
      setFactorCode(normalizeBackupInput(raw));
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher 5 cas
    startTransition(async () => {
      const formData = new FormData();
      formData.set('password', password);
      formData.set('secondFactorKind', factorKind);
      formData.set('secondFactorCode', factorCode);
      const result = await startDeviceChangeAction(formData);

      if (result.kind === 'ok') {
        // Le nouveau secret est pending — il faut compléter
        // l'enrôlement. On redirige vers /mfa/enroll qui détectera
        // le secret pending par enrollmentRequestId et reprendra le
        // flow. Pour MVP simple : on stash les données dans
        // sessionStorage pour que la page enroll les pick up — mais
        // pour rester scope contenu, on redirige vers home et la
        // prochaine connexion redemandera l'enrôlement via le
        // middleware (Phase 9 polish).
        router.push(`/${toUrlLocale(locale)}/mfa/enroll`);
        return;
      }
      if (result.kind === 'invalid_credentials') {
        setError('Mot de passe incorrect.');
        setPassword('');
        return;
      }
      if (result.kind === 'invalid_second_factor') {
        setError(
          factorKind === 'totp'
            ? 'Code TOTP invalide. Vérifiez votre application et réessayez.'
            : 'Code de récupération invalide ou déjà consommé.',
        );
        setFactorCode('');
        return;
      }
      if (result.kind === 'mfa_not_enrolled') {
        setError("Vous n'avez pas de MFA actif — utilisez plutôt /mfa/enroll.");
        return;
      }
      setError('Erreur inattendue. Réessayez ou contactez le support.');
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium">
          Votre mot de passe actuel
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
          required
          minLength={8}
          className="block w-full max-w-sm rounded border border-slate-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-100"
        />
      </div>

      <fieldset className="rounded border border-slate-200 bg-slate-50 p-4">
        <legend className="px-2 text-sm font-medium">Second facteur de vérification</legend>
        <p className="mb-3 text-sm text-slate-600">
          Prouvez la possession de votre ancien device en saisissant soit son code TOTP courant,
          soit l'un de vos codes de récupération non consommés.
        </p>
        <div className="mb-4 flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="factorKind"
              value="totp"
              checked={factorKind === 'totp'}
              onChange={() => {
                setFactorKind('totp');
                setFactorCode('');
              }}
              disabled={isPending}
            />
            Code TOTP (6 chiffres)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="factorKind"
              value="backup_code"
              checked={factorKind === 'backup_code'}
              onChange={() => {
                setFactorKind('backup_code');
                setFactorCode('');
              }}
              disabled={isPending}
            />
            Code de récupération (XXXX-XXXX-XX)
          </label>
        </div>
        <input
          id="factor-code"
          type="text"
          inputMode={factorKind === 'totp' ? 'numeric' : 'text'}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={factorLength}
          value={factorCode}
          onChange={(e) => handleFactorChange(e.target.value)}
          disabled={isPending}
          aria-label={factorKind === 'totp' ? 'Code TOTP à 6 chiffres' : 'Code de récupération'}
          placeholder={factorKind === 'totp' ? '123456' : 'ABCD-EFGH-JK'}
          className="block w-full max-w-xs rounded border border-slate-300 bg-white px-3 py-2 font-mono text-lg tracking-wider focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-100"
        />
      </fieldset>

      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isPending}
          className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? 'Vérification…' : 'Changer de device'}
        </button>
      </div>
    </form>
  );
}
