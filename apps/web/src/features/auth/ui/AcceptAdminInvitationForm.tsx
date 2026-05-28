'use client';

import { acceptAdminInvitationAction } from '@/features/auth/actions/auth.actions';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface Props {
  readonly token: string;
  readonly locale: string;
}

export function AcceptAdminInvitationForm({ token, locale }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setMessage(null);
    setErrors([]);
    const formData = new FormData(e.currentTarget);
    const firstName = String(formData.get('firstName') ?? '');
    const lastName = String(formData.get('lastName') ?? '');
    const password = String(formData.get('password') ?? '');
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher d'erreurs typé sur 5 kinds — extraire serait artificiel.
    startTransition(async () => {
      const result = await acceptAdminInvitationAction(token, firstName, lastName, password);
      if (result.kind === 'ok') {
        router.push(`/${locale}${result.redirect}`);
      } else if (result.kind === 'invalid_or_expired') {
        setMessage("Ce lien d'invitation a expiré. Demandez une nouvelle invitation.");
      } else if (result.kind === 'target_already_registered') {
        setMessage('Ce courriel est déjà associé à un compte.');
      } else if (result.kind === 'validation_error') {
        setErrors(result.errors);
      } else {
        setMessage('Erreur inattendue. Réessayez plus tard.');
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-slate-700">
            Prénom
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-slate-700">
            Nom
          </label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            autoComplete="family-name"
            required
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
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
      {message && (
        <output className="block rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {message}
        </output>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Activation…' : 'Activer mon compte administrateur'}
      </button>
    </form>
  );
}
