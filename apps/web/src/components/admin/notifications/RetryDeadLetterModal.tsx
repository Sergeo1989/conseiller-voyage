// T132 — Modal relance dead letter.
// Formulaire react-hook-form + Zod resolver. Accessible WCAG 2.1 AA.
// Motif obligatoire min 10 chars (FR-029).

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { retryDeadLetterAction } from '../../../app/[locale]/admin/notifications/_actions';

const schema = z.object({
  reason: z
    .string()
    .min(10, 'Le motif doit contenir au moins 10 caractères.')
    .max(1000, 'Le motif ne doit pas dépasser 1000 caractères.'),
});

type FormValues = z.infer<typeof schema>;

interface RetryDeadLetterModalProps {
  readonly logEntryId: string;
  readonly templateId: string;
  readonly lastError: string | null;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export function RetryDeadLetterModal({
  logEntryId,
  templateId,
  lastError,
  onClose,
  onSuccess,
}: RetryDeadLetterModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const result = await retryDeadLetterAction({ id: logEntryId, reason: values.reason });
    if (result.success) {
      onSuccess();
    } else {
      setServerError(result.error);
    }
  };

  return (
    <dialog
      open
      aria-labelledby="retry-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 m-0 w-full h-full p-0 border-0"
      onCancel={onClose}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id="retry-modal-title" className="text-lg font-semibold">
          Relancer l&apos;envoi
        </h2>
        <dl className="mt-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Template :</dt>
            <dd className="font-mono">{templateId}</dd>
          </div>
          {lastError && (
            <div className="mt-1">
              <dt className="text-muted-foreground">Dernière erreur :</dt>
              <dd className="text-xs text-red-600">{lastError}</dd>
            </div>
          )}
        </dl>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="retry-reason" className="block text-sm font-medium">
              Motif de relance <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="retry-reason"
              {...register('reason')}
              rows={4}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              aria-describedby={errors.reason ? 'retry-reason-error' : undefined}
              aria-required="true"
              placeholder="Quota SES augmenté — relance maintenant sécurisée…"
            />
            {errors.reason && (
              <p id="retry-reason-error" role="alert" className="mt-1 text-xs text-red-600">
                {errors.reason.message}
              </p>
            )}
          </div>

          {serverError && (
            <p role="alert" className="text-sm text-red-600">
              {serverError}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? 'Relance…' : "Relancer l'envoi"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
