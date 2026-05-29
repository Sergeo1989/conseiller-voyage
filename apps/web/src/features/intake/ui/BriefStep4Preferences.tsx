// T068 — Étape 4 : Préférences (FR-005 + FR-006 + FR-007 + FR-008).
// Budget radio, langue conseiller select, spécialité select, familiarité radio.

'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import type { SubmitBriefPayload } from '../schemas';

const BUDGETS = [
  'under_2k',
  'between_2k_5k',
  'between_5k_10k',
  'between_10k_20k',
  'above_20k',
] as const;
const LANGUAGES = ['fr', 'en', 'es', 'other'] as const;
const SPECIALITIES = [
  'croisiere',
  'aventure_outdoor',
  'lune_de_miel',
  'famille_avec_enfants',
  'mobilite_reduite',
  'multigenerationnel',
  'culturel_historique',
  'luxe',
  'road_trip',
  'voyage_affaires',
  'autre',
] as const;
const FAMILIARITIES = ['first_big_trip', 'occasional_traveler', 'experienced_traveler'] as const;

export function BriefStep4Preferences(): ReactNode {
  const t = useTranslations('intake.form.step4');
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<SubmitBriefPayload>();
  const language = watch('conseillerLanguage');
  const speciality = watch('speciality');

  return (
    <section aria-labelledby="step4-title" className="space-y-5">
      <h2 id="step4-title" className="mb-4 text-xl font-medium">
        {t('title')}
      </h2>

      {/* Budget */}
      <fieldset>
        <legend className="text-sm font-medium">{t('budgetLabel')}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {BUDGETS.map((b) => (
            <label key={b} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
              <input type="radio" value={b} {...register('budgetRange')} />
              {b}
            </label>
          ))}
        </div>
        <div className="mt-2">
          <label htmlFor="budgetNote" className="block text-xs font-medium">
            {t('budgetNoteLabel')}
            <input
              id="budgetNote"
              type="text"
              {...register('budgetNote')}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </label>
        </div>
      </fieldset>

      {/* Langue */}
      <div>
        <label htmlFor="conseillerLanguage" className="block text-sm font-medium">
          {t('languageLabel')}
          <select
            id="conseillerLanguage"
            {...register('conseillerLanguage')}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            aria-invalid={Boolean(errors.conseillerLanguage)}
          >
            <option value="">—</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {language === 'other' && (
          <div className="mt-2 max-w-xs">
            <label htmlFor="conseillerLanguageOther" className="block text-xs font-medium">
              {t('languageOtherLabel')}
              <input
                id="conseillerLanguageOther"
                type="text"
                maxLength={2}
                {...register('conseillerLanguageOther')}
                className="mt-1 w-20 rounded border px-3 py-2 text-sm"
              />
            </label>
          </div>
        )}
      </div>

      {/* Spécialité */}
      <div>
        <label htmlFor="speciality" className="block text-sm font-medium">
          {t('specialityLabel')}
          <select
            id="speciality"
            {...register('speciality')}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            aria-invalid={Boolean(errors.speciality)}
          >
            <option value="">—</option>
            {SPECIALITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {speciality === 'autre' && (
          <div className="mt-2">
            <label htmlFor="specialityOther" className="block text-xs font-medium">
              {t('specialityOtherLabel')}
              <input
                id="specialityOther"
                type="text"
                maxLength={200}
                {...register('specialityOther')}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              />
            </label>
          </div>
        )}
      </div>

      {/* Familiarité */}
      <fieldset>
        <legend className="text-sm font-medium">{t('familiarityLabel')}</legend>
        <div className="mt-2 space-y-1">
          {FAMILIARITIES.map((f) => (
            <label key={f} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
              <input type="radio" value={f} {...register('familiarity')} />
              {f}
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
