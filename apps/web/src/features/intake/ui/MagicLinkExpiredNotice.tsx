// T070b (H4) — MagicLinkExpiredNotice.
//
// Page /voyage/lien-expire — affichée quand verifyMagicLinkAction retourne
// TOKEN_EXPIRED, TOKEN_NOT_FOUND ou TOKEN_ALREADY_CONSUMED. Permet au
// voyageur de demander un nouveau lien en saisissant son email.
//
// Réponse uniforme « sent_or_email_not_found » (anti-énumération email).

'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState, useTransition } from 'react';
import { resendMagicLinkAction } from '../actions/resend-magic-link.action';

export function MagicLinkExpiredNotice(): ReactNode {
  const t = useTranslations('intake.linkExpired');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!email) return;
    startTransition(async () => {
      await resendMagicLinkAction(email);
      // Réponse uniforme — pas de distinction succès/non-trouvé.
      setSubmitted(true);
    });
  }

  return (
    <article className="mx-auto max-w-2xl space-y-4 py-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-base">{t('subtitle')}</p>

      {submitted ? (
        <output className="block rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {t('successMessage')}
        </output>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <div>
            <label htmlFor="expired-email" className="block text-sm font-medium">
              {t('emailLabel')}
            </label>
            <input
              id="expired-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isPending || email.length === 0}
            className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {isPending ? '…' : t('resendButton')}
          </button>
        </form>
      )}
    </article>
  );
}
