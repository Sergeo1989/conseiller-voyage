// T067 — Étape 3 : Composition du groupe (FR-004).
// Adultes / enfants (avec âges 3-17) / bébés (0-2).

'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import type { SubmitBriefPayload } from '../schemas';

export function BriefStep3Groupe(): ReactNode {
  const t = useTranslations('intake.form.step3');
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<SubmitBriefPayload>();
  const childrenArray = useFieldArray({
    control,
    // childrenAges est une string[] de NUMBERs — RHF accepte le cast ici.
    name: 'childrenAges' as never,
  });

  return (
    <section aria-labelledby="step3-title">
      <h2 id="step3-title" className="mb-4 text-xl font-medium">
        {t('title')}
      </h2>

      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <label htmlFor="adultsCount" className="block text-sm font-medium">
            {t('adultsLabel')}
            <input
              id="adultsCount"
              type="number"
              min={1}
              max={20}
              {...register('adultsCount', { valueAsNumber: true })}
              className="mt-1 w-24 rounded border px-3 py-2 text-sm"
              aria-invalid={Boolean(errors.adultsCount)}
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">{t('childrenLabel')}</legend>
          <div className="mt-2 space-y-2">
            {childrenArray.fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <input
                  type="number"
                  min={3}
                  max={17}
                  aria-label={t('childAgeLabel', { index: index + 1 })}
                  {...register(`childrenAges.${index}` as never, { valueAsNumber: true })}
                  className="w-20 rounded border px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => childrenArray.remove(index)}
                  className="rounded border px-2 py-1 text-xs hover:bg-muted"
                  aria-label="Retirer"
                >
                  ✕
                </button>
              </div>
            ))}
            {childrenArray.fields.length < 12 && (
              <button
                type="button"
                onClick={() => childrenArray.append(8 as never)}
                className="rounded border px-3 py-1 text-xs hover:bg-muted"
              >
                + Enfant
              </button>
            )}
          </div>
        </fieldset>

        <div>
          <label htmlFor="infantsCount" className="block text-sm font-medium">
            {t('infantsLabel')}
            <input
              id="infantsCount"
              type="number"
              min={0}
              max={4}
              {...register('infantsCount', { valueAsNumber: true })}
              className="mt-1 w-24 rounded border px-3 py-2 text-sm"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
