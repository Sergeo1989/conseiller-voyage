'use client';

// PasswordResetCompleteForm — formulaire "choisir un nouveau mot de
// passe" après clic sur le lien email (US5).

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { completePasswordResetAction } from '../../lib/auth/server-actions';

interface Props {
  readonly token: string;
  readonly locale: string;
}

const ERROR_LABELS: Record<string, string> = {
  PASSWORD_TOO_SHORT: 'Le mot de passe doit contenir au moins 12 caractères.',
  PASSWORD_TOO_LONG: 'Le mot de passe est trop long (max 128 caractères).',
  PASSWORD_MISSING_LOWERCASE: 'Ajoutez au moins une lettre minuscule.',
  PASSWORD_MISSING_UPPERCASE: 'Ajoutez au moins une lettre majuscule.',
  PASSWORD_MISSING_DIGIT: 'Ajoutez au moins un chiffre.',
  PASSWORD_MISSING_SYMBOL: 'Ajoutez au moins un caractère spécial (!@#$%…).',
};

export function PasswordResetCompleteForm({ token, locale }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setFieldErrors([]);
    setServerError(null);
    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get('newPassword');
    if (typeof newPassword !== 'string') return;
    startTransition(async () => {
      const result = await completePasswordResetAction(token, newPassword);
      if (result.kind === 'ok') {
        router.push(`/${locale}/connexion?verified=1`);
      } else if (result.kind === 'invalid_or_expired') {
        setServerError(
          "Ce lien n'est plus valide. Demandez un nouveau lien depuis la page « Mot de passe oublié ».",
        );
      } else if (result.kind === 'validation_error') {
        setFieldErrors(result.errors);
      } else {
        setServerError('Une erreur inattendue est survenue. Réessayez plus tard.');
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700">
          Nouveau mot de passe
        </label>
        <input
          id="newPassword"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          required
          aria-describedby="newPassword-help"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
        <p id="newPassword-help" className="mt-1 text-xs text-slate-500">
          Au moins 12 caractères, avec minuscules, majuscules, chiffres et symboles.
        </p>
        {fieldErrors.map((code) => (
          <p key={code} className="mt-1 text-sm text-red-700">
            {ERROR_LABELS[code] ?? code}
          </p>
        ))}
      </div>
      {serverError && (
        <output className="block rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {serverError}
        </output>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Enregistrement…' : 'Choisir ce mot de passe'}
      </button>
    </form>
  );
}
