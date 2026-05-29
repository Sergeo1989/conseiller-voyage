// T064 — BriefFormWizard (Client Component).
//
// Orchestrateur du formulaire 5 étapes :
//   - react-hook-form + zodResolver(SubmitBriefSchema)
//   - useTransition pour le submit non-bloquant
//   - localStorage reprise 24h (Q3 clarify) — scope PII intégral, plain
//     text, auto-clear post-submit OK et post-anonymisation (cf. R5).
//   - Navigation Next/Back avec validation par étape (trigger() RHF)
//   - aria-live="polite" pour annonces erreurs aux lecteurs d'écran
//
// Cf. spec.md FR-001 + research.md R5 + tasks.md T064.

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState, useTransition } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { submitBriefAction } from '../actions/submit-brief.action';
import { type SubmitBriefPayload, SubmitBriefSchema } from '../schemas';
import { BriefStep1Destination } from './BriefStep1Destination';
import { BriefStep2Dates } from './BriefStep2Dates';
import { BriefStep3Groupe } from './BriefStep3Groupe';
import { BriefStep4Preferences } from './BriefStep4Preferences';
import { BriefStep5ContactConsentement } from './BriefStep5ContactConsentement';

const DRAFT_STORAGE_KEY = 'intake:draft:v1';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

interface DraftPayload {
  readonly timestamp: number;
  readonly data: Partial<SubmitBriefPayload>;
}

const DEFAULT_VALUES: Partial<SubmitBriefPayload> = {
  destinations: [{ country: '', region: '' }],
  departureDate: '',
  returnDate: '',
  datesFlexible: false,
  adultsCount: 2,
  childrenAges: [],
  infantsCount: 0,
  // consentGiven volontairement omis — l'utilisateur DOIT le cocher
  // explicitement à chaque tentative (FR-010).
};

interface BriefFormWizardProps {
  readonly localeForServerAction: 'fr-CA' | 'en';
}

export function BriefFormWizard({ localeForServerAction }: BriefFormWizardProps): ReactNode {
  const t = useTranslations('intake.form');
  const tErrors = useTranslations('intake.errors');
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const methods = useForm<SubmitBriefPayload>({
    resolver: zodResolver(SubmitBriefSchema as never),
    mode: 'onBlur',
    defaultValues: DEFAULT_VALUES as never,
  });

  // ─── localStorage reprise 24h (Q3 clarify) ───
  useEffect(() => {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as DraftPayload;
      if (Date.now() - parsed.timestamp > DRAFT_TTL_MS) {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        return;
      }
      methods.reset({ ...DEFAULT_VALUES, ...parsed.data } as never);
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, [methods]);

  useEffect(() => {
    const sub = methods.watch((value) => {
      // Le consentGiven n'est volontairement PAS persisté : il DOIT être
      // re-coché à chaque tentative de soumission (FR-010 explicit consent).
      const { consentGiven: _consentGiven, ...persistedData } = value;
      const payload: DraftPayload = {
        timestamp: Date.now(),
        data: persistedData as Partial<SubmitBriefPayload>,
      };
      try {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // quota plein → on ignore silencieusement, la reprise sera juste indisponible
      }
    });
    return () => sub.unsubscribe();
  }, [methods]);

  async function goNext(): Promise<void> {
    const fieldsByStep: Record<number, ReadonlyArray<string>> = {
      1: ['destinations'],
      2: ['departureDate', 'returnDate', 'datesFlexible', 'datesFlexibilityDays'],
      3: ['adultsCount', 'childrenAges', 'infantsCount'],
      4: [
        'budgetRange',
        'conseillerLanguage',
        'conseillerLanguageOther',
        'speciality',
        'specialityOther',
        'familiarity',
      ],
    };
    const fields = fieldsByStep[currentStep] ?? [];
    const valid = await methods.trigger(fields as never);
    if (valid) setCurrentStep((s) => Math.min(5, s + 1));
  }

  function goBack(): void {
    setCurrentStep((s) => Math.max(1, s - 1));
    setServerError(null);
  }

  function onSubmit(data: SubmitBriefPayload): void {
    setServerError(null);
    startTransition(async () => {
      const result = await submitBriefAction(data);
      if (result.ok) {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        const localePath = localeForServerAction === 'fr-CA' ? 'fr' : 'en';
        router.push(
          `/${localePath}/voyage/email-envoye?email=${encodeURIComponent(data.contact.email)}`,
        );
        return;
      }
      setServerError(mapResultToErrorMessage(result, tErrors));
    });
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)} noValidate>
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          <p className="mt-2 text-xs font-mono text-muted-foreground" aria-live="polite">
            {t('stepLabel', { current: currentStep, total: 5 })}
          </p>
        </header>

        <div className="mb-6">
          {currentStep === 1 && <BriefStep1Destination />}
          {currentStep === 2 && <BriefStep2Dates />}
          {currentStep === 3 && <BriefStep3Groupe />}
          {currentStep === 4 && <BriefStep4Preferences />}
          {currentStep === 5 && <BriefStep5ContactConsentement />}
        </div>

        {serverError && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-4 rounded border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {serverError}
          </div>
        )}

        <nav className="flex justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            disabled={currentStep === 1 || isPending}
            className="rounded border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('previousStep')}
          </button>

          {currentStep < 5 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={isPending}
              className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
            >
              {t('nextStep')}
            </button>
          ) : (
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {isPending ? '…' : t('submit')}
            </button>
          )}
        </nav>
      </form>
    </FormProvider>
  );
}

type ErrorTranslator = (key: string, values?: Record<string, number | string>) => string;
type FailureResult = Awaited<ReturnType<typeof submitBriefAction>> & { ok: false };

function mapResultToErrorMessage(result: FailureResult, tErrors: ErrorTranslator): string {
  if (result.code === 'EMAIL_RATE_LIMIT_EXCEEDED') {
    const hours = result.retryAfterSeconds ? Math.ceil(result.retryAfterSeconds / 3600) : 24;
    return tErrors('rateLimitEmail', { hours });
  }
  if (result.code === 'RATE_LIMIT_EXCEEDED') {
    return tErrors('rateLimitGeneric');
  }
  if (result.code === 'DISPOSABLE_EMAIL_DETECTED') {
    return tErrors('disposableEmail');
  }
  return result.message;
}
