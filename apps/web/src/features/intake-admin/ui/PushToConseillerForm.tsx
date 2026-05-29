// T124 — PushToConseillerForm (Client Component).
//
// Input conseiller compliance ID (UUID) + motif texte 20-500 chars +
// bouton submit. Idempotency-Key auto-généré côté apiClient.
// L'autocomplete conseillers vérifiés sera livré en Phase 8 (nécessite
// endpoint listVerifiedCompliances).

'use client';

import { type FormEvent, type ReactNode, useState, useTransition } from 'react';
import { pushBriefToConseillerAction } from '../actions/push-brief-to-conseiller.action';

interface PushToConseillerFormProps {
  readonly briefId: string;
}

export function PushToConseillerForm({ briefId }: PushToConseillerFormProps): ReactNode {
  const [conseillerComplianceId, setConseillerComplianceId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const reasonValid = reason.length >= 20 && reason.length <= 500;
  const idValid = /^[0-9a-f-]{36}$/i.test(conseillerComplianceId);
  const canSubmit = reasonValid && idValid && !isPending;

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await pushBriefToConseillerAction(briefId, conseillerComplianceId, reason);
      if (result.ok) {
        setSuccess(true);
        setConseillerComplianceId('');
        setReason('');
        return;
      }
      setError(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div>
        <label htmlFor="conseiller-id" className="block text-sm font-medium">
          ID conformité du conseiller (UUID)
        </label>
        <input
          id="conseiller-id"
          type="text"
          value={conseillerComplianceId}
          onChange={(e) => setConseillerComplianceId(e.currentTarget.value)}
          className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
          aria-invalid={conseillerComplianceId.length > 0 && !idValid}
          autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor="push-reason" className="block text-sm font-medium">
          Motif du push (20-500 caractères)
        </label>
        <textarea
          id="push-reason"
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          minLength={20}
          maxLength={500}
          rows={3}
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          aria-invalid={reason.length > 0 && !reasonValid}
          aria-describedby="push-reason-counter"
        />
        <p
          id="push-reason-counter"
          className="mt-1 text-xs text-muted-foreground"
          aria-live="polite"
        >
          {reason.length} / 500
        </p>
      </div>

      {error && (
        <output
          className="block rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
          aria-live="assertive"
        >
          {error}
        </output>
      )}
      {success && (
        <output
          className="block rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          aria-live="polite"
        >
          Push effectué. Audit + outbox publiés.
        </output>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? '…' : 'Pousser le brief'}
      </button>
    </form>
  );
}
