// T070 — EmailSentNotice (FR-013a Q1, H2).
//
// Page affichée après submitBriefAction succès. UX countdown 120s :
//   - Bouton « renvoyer le lien » disabled à t=0
//   - Compteur visible 120s côté client (libellé "Disponible dans Xs")
//   - aria-disabled + aria-live="polite" pour annonce lecteur d'écran
//   - À t=120s : bouton enabled, label change ; clic relance le compteur
//
// Cf. spec.md FR-013a + tasks.md T070 + i18n intake.emailSent.*

'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState, useTransition } from 'react';
import { resendMagicLinkAction } from '../actions/resend-magic-link.action';

const COUNTDOWN_SECONDS = 120;

interface EmailSentNoticeProps {
  readonly email: string;
}

export function EmailSentNotice({ email }: EmailSentNoticeProps): ReactNode {
  const t = useTranslations('intake.emailSent');
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setTimeout(() => setRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [remaining]);

  function handleResend(): void {
    if (remaining > 0 || isPending) return;
    startTransition(async () => {
      setResendStatus('sending');
      const result = await resendMagicLinkAction(email);
      if (result.ok) {
        setResendStatus('sent');
        setRemaining(COUNTDOWN_SECONDS);
      } else {
        setResendStatus('error');
      }
    });
  }

  const buttonDisabled = remaining > 0 || isPending;
  const buttonLabel = buttonDisabled
    ? t('resendDisabled', { seconds: remaining })
    : t('resendEnabled');

  return (
    <article className="mx-auto max-w-2xl space-y-4 py-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-base">{t('subtitle', { email })}</p>
      <p className="text-sm text-muted-foreground">{t('delayHint')}</p>

      <div className="pt-4">
        <button
          type="button"
          onClick={handleResend}
          disabled={buttonDisabled}
          aria-disabled={buttonDisabled}
          aria-live="polite"
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          title={buttonDisabled ? buttonLabel : undefined}
        >
          {buttonLabel}
        </button>
        {resendStatus === 'sent' && (
          <output className="mt-2 block text-sm text-green-700" aria-live="polite">
            {t('resendSuccess')}
          </output>
        )}
      </div>
    </article>
  );
}
