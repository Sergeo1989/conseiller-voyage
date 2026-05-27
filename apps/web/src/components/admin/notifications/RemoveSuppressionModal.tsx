// T131 — Modal retrait suppression list.
// Formulaire react-hook-form + Zod resolver. Accessible WCAG 2.1 AA.
// - Dialog avec rôle dialog, aria-modal, aria-labelledby.
// - Focus piégé dans le dialog.
// - Motif texte min 10 chars requis (FR-028).

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { removeFromSuppressionAction } from '../../../app/[locale]/admin/notifications/_actions';

const schema = z.object({
  reason: z
    .string()
    .min(10, 'Le motif doit contenir au moins 10 caractères.')
    .max(1000, 'Le motif ne doit pas dépasser 1000 caractères.'),
});

type FormValues = z.infer<typeof schema>;

interface RemoveSuppressionModalProps {
  readonly suppressionId: string;
  readonly emailHashPreview: string;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export function RemoveSuppressionModal({
  suppressionId,
  emailHashPreview,
  onClose,
  onSuccess,
}: RemoveSuppressionModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const result = await removeFromSuppressionAction({ id: suppressionId, reason: values.reason });
    if (result.success) {
      onSuccess();
    } else {
      setServerError(result.error);
    }
  };

  return (
    <dialog
      open
      aria-labelledby="remove-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 m-0 w-full h-full p-0 border-0"
      onCancel={onClose}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id="remove-modal-title" className="text-lg font-semibold">
          Retirer de la liste de suppression
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hash : <span className="font-mono">{emailHashPreview}</span>
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="reason" className="block text-sm font-medium">
              Motif du retrait <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="reason"
              {...register('reason')}
              rows={4}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              aria-describedby={errors.reason ? 'reason-error' : undefined}
              aria-required="true"
              placeholder="Faux positif confirmé — raison détaillée…"
            />
            {errors.reason && (
              <p id="reason-error" role="alert" className="mt-1 text-xs text-red-600">
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
              ref={closeRef}
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
              {isSubmitting ? 'Traitement…' : 'Confirmer le retrait'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
