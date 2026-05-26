'use client';

// SignupForm — formulaire d'inscription conseiller (US1).
//
// Validation client-side via react-hook-form + zod resolver (schéma
// partagé via @cv/auth-domain). Validation server-side authoritative
// via la Server Action signupAction. Messages d'erreur FR-CA exposés
// via aria-describedby (Principe XI a11y).

import { type SignupDto, SignupDtoSchema } from '@cv/auth-domain/dtos';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { signupAction } from '../../lib/auth/server-actions';

interface SignupFormProps {
  readonly locale: string;
}

const ERROR_LABELS: Record<string, string> = {
  EMAIL_INVALID: 'Courriel invalide.',
  PASSWORD_TOO_SHORT: 'Le mot de passe doit contenir au moins 12 caractères.',
  PASSWORD_TOO_LONG: 'Le mot de passe est trop long (max 128 caractères).',
  PASSWORD_MISSING_LOWERCASE: 'Ajoutez au moins une lettre minuscule.',
  PASSWORD_MISSING_UPPERCASE: 'Ajoutez au moins une lettre majuscule.',
  PASSWORD_MISSING_DIGIT: 'Ajoutez au moins un chiffre.',
  PASSWORD_MISSING_SYMBOL: 'Ajoutez au moins un caractère spécial (!@#$%…).',
  PASSWORD_CONTAINS_EMAIL: 'Le mot de passe ne doit pas contenir votre courriel.',
  PASSWORD_CONTAINS_FIRSTNAME: 'Le mot de passe ne doit pas contenir votre prénom.',
  TERMS_NOT_ACCEPTED: "Vous devez accepter les conditions d'utilisation.",
  PRIVACY_POLICY_NOT_ACCEPTED: 'Vous devez accepter la politique de vie privée.',
};

function humanError(code: string): string {
  return ERROR_LABELS[code] ?? code;
}

function buildFormData(data: SignupDto): FormData {
  const formData = new FormData();
  formData.set('email', data.email);
  formData.set('password', data.password);
  formData.set('firstName', data.firstName);
  formData.set('lastName', data.lastName);
  formData.set('acceptedTerms', data.acceptedTerms ? 'true' : 'false');
  formData.set('acceptedPrivacyPolicy', data.acceptedPrivacyPolicy ? 'true' : 'false');
  return formData;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: composant formulaire de 6 champs — chaque champ ajoute son test d'erreur. Extraire en sous-composants serait artificiel pour ce MVP unique d'écran.
export function SignupForm({ locale }: SignupFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<
    ReadonlyArray<{ field: string; code: string }>
  >([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupDto>({
    resolver: zodResolver(SignupDtoSchema),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      acceptedTerms: true,
      acceptedPrivacyPolicy: true,
    },
  });

  const handleResult = (result: Awaited<ReturnType<typeof signupAction>>, email: string): void => {
    if (result.kind === 'ok') {
      router.push(`/${locale}/inscription/confirmation?email=${encodeURIComponent(email)}`);
    } else if (result.kind === 'validation_error') {
      setServerFieldErrors(result.errors);
    } else if (result.kind === 'rate_limited') {
      setServerError("Trop de tentatives d'inscription. Réessayez dans une heure.");
    } else {
      setServerError('Une erreur inattendue est survenue. Réessayez plus tard.');
    }
  };

  const onSubmit = (data: SignupDto): void => {
    setServerError(null);
    setServerFieldErrors([]);
    startTransition(async () => {
      const result = await signupAction(buildFormData(data));
      handleResult(result, data.email);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-md space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Courriel
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          aria-invalid={errors.email ? 'true' : 'false'}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
        {errors.email && (
          <p id="email-error" className="mt-1 text-sm text-red-700">
            {humanError(errors.email.message ?? 'EMAIL_INVALID')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-slate-700">
            Prénom
          </label>
          <input
            id="firstName"
            type="text"
            autoComplete="given-name"
            {...register('firstName')}
            aria-invalid={errors.firstName ? 'true' : 'false'}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-slate-700">
            Nom
          </label>
          <input
            id="lastName"
            type="text"
            autoComplete="family-name"
            {...register('lastName')}
            aria-invalid={errors.lastName ? 'true' : 'false'}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          aria-invalid={errors.password ? 'true' : 'false'}
          aria-describedby="password-help"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
        <p id="password-help" className="mt-1 text-xs text-slate-500">
          Au moins 12 caractères, avec minuscules, majuscules, chiffres et symboles.
        </p>
        {errors.password && (
          <p className="mt-1 text-sm text-red-700">
            {humanError(errors.password.message ?? 'PASSWORD_TOO_SHORT')}
          </p>
        )}
        {serverFieldErrors
          .filter((e) => e.field === 'password')
          .map((e) => (
            <p key={e.code} className="mt-1 text-sm text-red-700">
              {humanError(e.code)}
            </p>
          ))}
      </div>

      <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            {...register('acceptedTerms')}
            aria-describedby="terms-error"
            className="mt-1"
          />
          <span>J'accepte les conditions générales d'utilisation de Conseiller Voyage.</span>
        </label>
        {errors.acceptedTerms && (
          <p id="terms-error" className="text-sm text-red-700">
            {humanError(errors.acceptedTerms.message ?? 'TERMS_NOT_ACCEPTED')}
          </p>
        )}
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            {...register('acceptedPrivacyPolicy')}
            aria-describedby="privacy-error"
            className="mt-1"
          />
          <span>J'accepte la politique de vie privée (Loi 25 Québec).</span>
        </label>
        {errors.acceptedPrivacyPolicy && (
          <p id="privacy-error" className="text-sm text-red-700">
            {humanError(errors.acceptedPrivacyPolicy.message ?? 'PRIVACY_POLICY_NOT_ACCEPTED')}
          </p>
        )}
      </div>

      {serverError && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Création en cours…' : 'Créer mon compte'}
      </button>
    </form>
  );
}
