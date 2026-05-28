'use client';

// ResendCountdownButton — composant Client US3.
//
// Bouton "Renvoyer le courriel" avec countdown 60s, persisté en
// sessionStorage (M8 — survive aux reloads). Accessible :
//   - aria-disabled + aria-live="polite" pendant le countdown
//   - aria-describedby renvoie sur le texte de countdown
// Au 2e renvoi infructueux, affiche un lien "contacter le support".

import { resendVerificationEmailAction } from '@/features/auth';
import { useCallback, useEffect, useState } from 'react';

interface ResendCountdownButtonProps {
  readonly email: string;
}

const COUNTDOWN_KEY_PREFIX = 'resend_verification_last_at_';
const COUNTDOWN_SEC = 60;

export function ResendCountdownButton({ email }: ResendCountdownButtonProps) {
  const storageKey = `${COUNTDOWN_KEY_PREFIX}${email}`;
  const [secondsLeft, setSecondsLeft] = useState<number>(COUNTDOWN_SEC);
  const [resendAttempts, setResendAttempts] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState<boolean>(false);

  // Au mount : si un dernier envoi est en sessionStorage et est récent,
  // reprendre le countdown depuis le reste.
  useEffect(() => {
    const lastAtRaw = sessionStorage.getItem(storageKey);
    if (lastAtRaw) {
      const lastAt = Number.parseInt(lastAtRaw, 10);
      const elapsed = Math.floor((Date.now() - lastAt) / 1000);
      if (elapsed < COUNTDOWN_SEC) {
        setSecondsLeft(COUNTDOWN_SEC - elapsed);
        return;
      }
    }
    setSecondsLeft(0);
  }, [storageKey]);

  // Tick chaque seconde tant que > 0.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const handleResend = useCallback(async () => {
    setIsPending(true);
    setStatusMessage(null);
    const result = await resendVerificationEmailAction(email);
    setIsPending(false);
    sessionStorage.setItem(storageKey, String(Date.now()));
    setSecondsLeft(COUNTDOWN_SEC);
    setResendAttempts((n) => n + 1);
    if (result.kind === 'ok') {
      setStatusMessage("Si ce courriel existe, un nouveau lien vient d'être envoyé.");
    } else {
      setStatusMessage('Erreur technique — réessayez plus tard.');
    }
  }, [email, storageKey]);

  const disabled = secondsLeft > 0 || isPending;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleResend}
        disabled={disabled}
        aria-disabled={disabled}
        aria-describedby="resend-status"
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {secondsLeft > 0
          ? `Renvoyer dans ${secondsLeft} s`
          : isPending
            ? 'Envoi en cours…'
            : 'Renvoyer le courriel'}
      </button>
      <p id="resend-status" aria-live="polite" className="text-sm text-slate-600">
        {statusMessage}
      </p>
      {resendAttempts >= 2 && (
        <p className="text-sm text-slate-600">
          Toujours rien ?{' '}
          <a href="mailto:support@conseiller-voyage.ca" className="text-blue-600 underline">
            Contactez le support
          </a>
          .
        </p>
      )}
    </div>
  );
}
