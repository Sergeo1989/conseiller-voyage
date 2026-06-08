// T011 [US2] — Actions de transition d'un lead (Client Component).
// N'affiche que les actions VALIDES depuis l'état courant (mapping UI pur,
// reflet de la machine d'état 012). Confirmation des actions terminales
// (refuser / perdu). Conflit (409) → message + rafraîchissement. Idempotence
// garantie côté API.

'use client';

import type { ActionResult } from '@/shared/lib/result';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { acceptLeadAction } from '../actions/accept-lead.action';
import { markBookingConfirmedAction } from '../actions/mark-booking-confirmed.action';
import { markLostAction } from '../actions/mark-lost.action';
import { markQuoteSentAction } from '../actions/mark-quote-sent.action';
import { refuseLeadAction } from '../actions/refuse-lead.action';
import { type LeadAction, type LeadState, type LeadView, WRITABLE_NEXT } from '../schemas/lead';

const TERMINAL: ReadonlyArray<LeadAction> = ['refuse', 'lost'];

export function LeadActions({ leadId, currentState }: { leadId: string; currentState: LeadState }) {
  const t = useTranslations('leads');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<LeadAction | null>(null);
  const [reason, setReason] = useState('');

  const available = WRITABLE_NEXT[currentState];
  if (available.length === 0) return null;

  function run(action: LeadAction): void {
    setError(null);
    startTransition(async () => {
      const res = await dispatch(action, leadId, locale, reason.trim() || undefined);
      if (res.ok) {
        setConfirming(null);
        setReason('');
        router.refresh();
      } else {
        setError(errorMessage(t, res.error.code, res.error.message));
      }
    });
  }

  function onClick(action: LeadAction): void {
    if (TERMINAL.includes(action)) {
      setConfirming(action);
      setError(null);
    } else {
      run(action);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {available.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => onClick(action)}
            disabled={pending}
            className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${
              action === 'accept'
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : TERMINAL.includes(action)
                  ? 'border border-rose-300 text-rose-700 hover:bg-rose-50'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t(`action.${action}`)}
          </button>
        ))}
      </div>

      {confirming && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            {confirming === 'refuse' ? t('confirmRefuse') : t('confirmLost')}
          </p>
          <label className="mt-2 block text-sm text-slate-700">
            {t('reasonLabel')}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('reasonPlaceholder')}
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => run(confirming)}
              disabled={pending}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {pending ? t('working') : t('confirm')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={pending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

const KNOWN_ERROR_CODES = ['CONFLICT', 'INVALID_TRANSITION', 'FORBIDDEN', 'ACTION_ERROR'] as const;
type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

function errorMessage(
  t: (key: `error.${KnownErrorCode}`) => string,
  code: string,
  fallback: string,
): string {
  return (KNOWN_ERROR_CODES as ReadonlyArray<string>).includes(code)
    ? t(`error.${code as KnownErrorCode}`)
    : fallback;
}

function dispatch(
  action: LeadAction,
  leadId: string,
  locale: string,
  reason?: string,
): Promise<ActionResult<LeadView>> {
  switch (action) {
    case 'accept':
      return acceptLeadAction({ leadId, locale });
    case 'refuse':
      return refuseLeadAction(
        reason !== undefined ? { leadId, locale, reason } : { leadId, locale },
      );
    case 'quote-sent':
      return markQuoteSentAction({ leadId, locale });
    case 'booking-confirmed':
      return markBookingConfirmedAction({ leadId, locale });
    case 'lost':
      return markLostAction(reason !== undefined ? { leadId, locale, reason } : { leadId, locale });
  }
}
