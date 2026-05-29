// T065 — Étape 1 : Destination (FR-002).
// Multi-stop : input pays + région optionnelle, bouton « Ajouter » jusqu'à
// MAX_DESTINATIONS (10).

'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { MAX_DESTINATIONS, type SubmitBriefPayload } from '../schemas';

export function BriefStep1Destination(): ReactNode {
  const t = useTranslations('intake.form.step1');
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<SubmitBriefPayload>();
  const { fields, append, remove } = useFieldArray({ control, name: 'destinations' });

  return (
    <section aria-labelledby="step1-title">
      <h2 id="step1-title" className="mb-4 text-xl font-medium">
        {t('title')}
      </h2>
      <fieldset className="space-y-3">
        <legend className="sr-only">{t('destinationsLabel')}</legend>
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor={`destinations.${index}.country`} className="text-sm font-medium">
                {t('destinationCountryLabel')}
              </label>
              <input
                id={`destinations.${index}.country`}
                type="text"
                {...register(`destinations.${index}.country` as const)}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
                aria-invalid={Boolean(errors.destinations?.[index]?.country)}
              />
            </div>
            <div className="flex-1">
              <label htmlFor={`destinations.${index}.region`} className="text-sm font-medium">
                {t('destinationRegionLabel')}
              </label>
              <input
                id={`destinations.${index}.region`}
                type="text"
                {...register(`destinations.${index}.region` as const)}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            {fields.length > 1 && (
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={t('removeDestination')}
                className="mb-1 rounded border px-2 py-2 text-sm hover:bg-muted"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {fields.length < MAX_DESTINATIONS && (
          <button
            type="button"
            onClick={() => append({ country: '', region: '' })}
            className="rounded border px-3 py-2 text-sm hover:bg-muted"
          >
            + {t('addDestination')}
          </button>
        )}
      </fieldset>
    </section>
  );
}
