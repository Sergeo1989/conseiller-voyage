'use client';

import { changePasswordAction } from '@/features/auth/actions/auth.actions';
import { useState, useTransition } from 'react';

interface Props {
  readonly locale: string;
}

export function ChangePasswordForm({ locale: _locale }: Props) {
  const [isPending, startTransition] = useTransition();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [done, setDone] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setServerMessage(null);
    setErrors([]);
    const formData = new FormData(e.currentTarget);
    const currentPassword = String(formData.get('currentPassword') ?? '');
    const newPassword = String(formData.get('newPassword') ?? '');
    const newPasswordConfirmation = String(formData.get('newPasswordConfirmation') ?? '');
    if (newPassword !== newPasswordConfirmation) {
      setServerMessage('Les deux mots de passe ne correspondent pas.');
      return;
    }
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher d'erreurs typé sur 6 kinds — extraire serait artificiel.
    startTransition(async () => {
      const result = await changePasswordAction(
        currentPassword,
        newPassword,
        newPasswordConfirmation,
      );
      if (result.kind === 'ok') {
        setDone(true);
        setServerMessage(
          `Mot de passe changé. ${result.sessionsRevokedCount} autre(s) session(s) déconnectée(s).`,
        );
      } else if (result.kind === 'invalid_current') {
        setServerMessage('Le mot de passe actuel est incorrect.');
      } else if (result.kind === 'password_reuse') {
        setServerMessage('Le nouveau mot de passe doit être différent du précédent.');
      } else if (result.kind === 'step_up_required') {
        setServerMessage(
          'Une vérification MFA est requise. Allez sur /mfa/step-up puis réessayez.',
        );
      } else if (result.kind === 'validation_error') {
        setErrors(result.errors);
      } else {
        setServerMessage('Erreur inattendue. Réessayez plus tard.');
      }
    });
  };

  if (done) {
    return (
      <output className="block rounded-md border border-green-300 bg-green-50 p-4 text-green-900">
        {serverMessage}
      </output>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-700">
          Mot de passe actuel
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700">
          Nouveau mot de passe
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
        <p className="mt-1 text-xs text-slate-500">
          Au moins 12 caractères, minuscules, majuscules, chiffres et symboles.
        </p>
        {errors.map((e) => (
          <p key={e} className="mt-1 text-sm text-red-700">
            {e}
          </p>
        ))}
      </div>
      <div>
        <label
          htmlFor="newPasswordConfirmation"
          className="block text-sm font-medium text-slate-700"
        >
          Confirmer le nouveau mot de passe
        </label>
        <input
          id="newPasswordConfirmation"
          name="newPasswordConfirmation"
          type="password"
          autoComplete="new-password"
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </div>
      {serverMessage && (
        <output className="block rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {serverMessage}
        </output>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Enregistrement…' : 'Changer le mot de passe'}
      </button>
    </form>
  );
}
