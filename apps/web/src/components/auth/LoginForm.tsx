'use client';

// LoginForm — formulaire de connexion (US2).
//
// Validation client-side via react-hook-form + zod resolver.
// Affiche un countdown lisible (M2) en cas de lockout — `aria-live="polite"`.

import { type LoginDto, LoginDtoSchema } from '@cv/auth-domain/dtos';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { loginAction } from '../../lib/auth/server-actions';

interface LoginFormProps {
  readonly locale: string;
}

function formatRetry(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

export function LoginForm({ locale }: LoginFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [lockoutSec, setLockoutSec] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginDto>({
    resolver: zodResolver(LoginDtoSchema),
    defaultValues: { email: '', password: '' },
  });

  // Countdown lockout — décrémente chaque seconde.
  useEffect(() => {
    if (lockoutSec === null || lockoutSec <= 0) return;
    const id = setTimeout(() => setLockoutSec((prev) => (prev !== null ? prev - 1 : null)), 1000);
    return () => clearTimeout(id);
  }, [lockoutSec]);

  const onSubmit = (data: LoginDto): void => {
    setServerError(null);
    setLockoutSec(null);
    const formData = new FormData();
    formData.set('email', data.email);
    formData.set('password', data.password);
    startTransition(async () => {
      const result = await loginAction(formData);
      if (result.kind === 'ok') {
        router.push(`/${locale}${result.redirect}`);
      } else if (result.kind === 'invalid_credentials') {
        setServerError('Courriel ou mot de passe incorrect.');
      } else if (result.kind === 'locked') {
        setLockoutSec(result.retryAfterSec);
      } else {
        setServerError('Une erreur inattendue est survenue. Réessayez plus tard.');
      }
    });
  };

  const isLocked = lockoutSec !== null && lockoutSec > 0;

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
          disabled={isLocked}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
        {errors.email && <p className="mt-1 text-sm text-red-700">Courriel invalide.</p>}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
          aria-invalid={errors.password ? 'true' : 'false'}
          disabled={isLocked}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
        />
        <p className="mt-1 text-sm">
          <a href={`/${locale}/mot-de-passe-oublie`} className="text-blue-600 underline">
            Mot de passe oublié ?
          </a>
        </p>
      </div>

      {serverError && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">
          {serverError}
        </div>
      )}

      {isLocked && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-orange-300 bg-orange-50 p-3 text-orange-900"
        >
          Trop de tentatives. Réessayez dans <strong>{formatRetry(lockoutSec)}</strong>.
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || isLocked}
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Connexion en cours…' : 'Se connecter'}
      </button>
    </form>
  );
}
