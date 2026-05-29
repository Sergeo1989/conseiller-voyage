// T069 — Étape 5 : Coordonnées + consentement Loi 25 (FR-009 + FR-010).
//
// La case consentement est NON PRÉ-COCHÉE (FR-010) et obligatoire pour
// soumettre. Le texte est explicite sur la finalité, la rétention, et le
// droit à l'effacement (Principe II Loi 25).

'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import type { SubmitBriefPayload } from '../schemas';

export function BriefStep5ContactConsentement(): ReactNode {
  const t = useTranslations('intake.form.step5');
  const {
    register,
    formState: { errors },
  } = useFormContext<SubmitBriefPayload>();

  return (
    <section aria-labelledby="step5-title" className="space-y-4">
      <h2 id="step5-title" className="mb-2 text-xl font-medium">
        {t('title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('subtitle')}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium">
            {t('firstNameLabel')}
            <input
              id="firstName"
              type="text"
              {...register('contact.firstName')}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              aria-invalid={Boolean(errors.contact?.firstName)}
            />
          </label>
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium">
            {t('lastNameLabel')}
            <input
              id="lastName"
              type="text"
              {...register('contact.lastName')}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              aria-invalid={Boolean(errors.contact?.lastName)}
            />
          </label>
        </div>
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          {t('emailLabel')}
          <input
            id="email"
            type="email"
            autoComplete="email"
            {...register('contact.email')}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            aria-invalid={Boolean(errors.contact?.email)}
            aria-describedby="email-hint"
          />
        </label>
        <p id="email-hint" className="mt-1 text-xs text-muted-foreground">
          {t('emailHint')}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium">
            {t('phoneLabel')}
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              {...register('contact.phone')}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div>
          <label htmlFor="postalCode" className="block text-sm font-medium">
            {t('postalCodeLabel')}
            <input
              id="postalCode"
              type="text"
              maxLength={7}
              autoComplete="postal-code"
              {...register('contact.postalCode')}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              placeholder="A1A 1A1"
            />
          </label>
        </div>
      </div>

      <div className="rounded border border-primary/20 bg-primary/5 p-3">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" {...register('consentGiven')} className="mt-1 h-4 w-4" />
          <span>{t('consentLabel')}</span>
        </label>
        {errors.consentGiven && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {t('consentRequired')}
          </p>
        )}
      </div>
    </section>
  );
}
