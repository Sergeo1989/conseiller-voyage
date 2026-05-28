'use client';

import { inviteAdminAction } from '@/features/auth/actions/auth.actions';
import { useState, useTransition } from 'react';

export function InviteAdminForm() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setMessage(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    const targetEmail = String(formData.get('targetEmail') ?? '');
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher d'erreurs typé sur 5 kinds — extraire serait artificiel.
    startTransition(async () => {
      const result = await inviteAdminAction(targetEmail);
      if (result.kind === 'ok') {
        setSuccess(true);
        setMessage(
          `Invitation envoyée. Expire le ${new Date(result.expiresAt).toLocaleString('fr-CA')}.`,
        );
      } else if (result.kind === 'self_invitation_forbidden') {
        setMessage('Vous ne pouvez pas vous inviter vous-même.');
      } else if (result.kind === 'target_already_registered') {
        setMessage(
          "Ce courriel est déjà associé à un compte. Supprimez d'abord ce compte via la procédure Loi 25.",
        );
      } else if (result.kind === 'invitation_already_active') {
        setMessage(
          `Une invitation est déjà active pour ce courriel jusqu'au ${new Date(result.expiresAt).toLocaleString('fr-CA')}.`,
        );
      } else {
        setMessage('Erreur inattendue. Vérifiez votre session step-up MFA et réessayez.');
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="targetEmail" className="block text-sm font-medium text-slate-700">
          Courriel du nouvel administrateur
        </label>
        <input
          id="targetEmail"
          name="targetEmail"
          type="email"
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </div>
      {message && (
        <output
          className={`block rounded-md border p-3 ${
            success
              ? 'border-green-300 bg-green-50 text-green-900'
              : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          {message}
        </output>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Envoi…' : "Envoyer l'invitation"}
      </button>
    </form>
  );
}
