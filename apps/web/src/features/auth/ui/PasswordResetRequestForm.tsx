'use client';

// PasswordResetRequestForm — formulaire "Mot de passe oublié" (US5).

import { requestPasswordResetAction } from '@/features/auth';
import { useState, useTransition } from 'react';

export function PasswordResetRequestForm() {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email');
    if (typeof email !== 'string' || email.length === 0) return;
    startTransition(async () => {
      await requestPasswordResetAction(email);
      setDone(true);
    });
  };

  if (done) {
    return (
      <output className="block rounded-md border border-green-300 bg-green-50 p-4 text-green-900">
        Si ce courriel existe, un lien de réinitialisation vient d'être envoyé. Vérifiez votre boîte
        (et vos courriels indésirables). Le lien est valide pendant 1 heure.
      </output>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Courriel
        </label>
        <input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Envoi…' : 'Envoyer le lien'}
      </button>
    </form>
  );
}
