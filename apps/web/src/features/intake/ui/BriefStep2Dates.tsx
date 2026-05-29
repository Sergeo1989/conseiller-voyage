// T066 — Étape 2 : Dates (FR-003).
// departureDate + returnDate + toggle flexible + amplitude 1-30j.

'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import type { SubmitBriefPayload } from '../schemas';

export function BriefStep2Dates(): ReactNode {
  const t = useTranslations('intake.form.step2');
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<SubmitBriefPayload>();
  const isFlexible = watch('datesFlexible');

  return (
    <section aria-labelledby="step2-title">
      <h2 id="step2-title" className="mb-4 text-xl font-medium">
        {t('title')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="departureDate" className="text-sm font-medium">
            {t('departureLabel')}
          </label>
          <input
            id="departureDate"
            type="date"
            {...register('departureDate')}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            aria-invalid={Boolean(errors.departureDate)}
          />
          {errors.departureDate && (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {errors.departureDate.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="returnDate" className="text-sm font-medium">
            {t('returnLabel')}
          </label>
          <input
            id="returnDate"
            type="date"
            {...register('returnDate')}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            aria-invalid={Boolean(errors.returnDate)}
          />
          {errors.returnDate && (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {errors.returnDate.message}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          id="datesFlexible"
          type="checkbox"
          {...register('datesFlexible')}
          className="h-4 w-4"
        />
        <label htmlFor="datesFlexible" className="text-sm">
          {t('flexibleLabel')}
        </label>
      </div>

      {isFlexible && (
        <div className="mt-3 max-w-xs">
          <label htmlFor="datesFlexibilityDays" className="text-sm font-medium">
            {t('flexibilityDaysLabel')}
          </label>
          <input
            id="datesFlexibilityDays"
            type="number"
            min={1}
            max={30}
            {...register('datesFlexibilityDays', { valueAsNumber: true })}
            className="mt-1 w-24 rounded border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('flexibilityDaysHint')}</p>
        </div>
      )}
    </section>
  );
}
