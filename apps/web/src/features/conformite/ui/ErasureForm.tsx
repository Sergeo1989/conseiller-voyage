// T125a — Formulaire client demande effacement Loi 25.
// Confirmation explicite par typage exact pour bloquer les accidents.

'use client';

import { ERASURE_CONFIRMATION_PHRASE } from '@cv/shared/conformite';
import { type FormEvent, type ReactNode, useState, useTransition } from 'react';
import { requestErasureAction } from '../actions/erasure.action';

// Cf. ERASURE_CONFIRMATION_PHRASE dans @cv/shared — phrase en FR-CA
// pour respecter Principe IV (Français d'abord), surtout sur un flux
// Loi 25 québécois.
const REQUIRED_CONFIRMATION = ERASURE_CONFIRMATION_PHRASE;

interface ErasureFormProps {
  readonly locale: string;
}

export function ErasureForm({ locale }: ErasureFormProps): ReactNode {
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    if (confirmation !== REQUIRED_CONFIRMATION) {
      setError(`Vous devez taper exactement : ${REQUIRED_CONFIRMATION}`);
      return;
    }
    startTransition(async () => {
      const result = await requestErasureAction({ confirmation }, locale);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(result.message);
    });
  }

  if (success) {
    return <output style={successStyle}>{success}</output>;
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}
      <label style={fieldLabelStyle}>
        Pour confirmer la demande, tapez exactement : <br />
        <code style={{ background: '#fef3c7', padding: '2px 6px' }}>{REQUIRED_CONFIRMATION}</code>
        <input
          type="text"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          required
          autoComplete="off"
          style={inputStyle}
        />
      </label>
      <button type="submit" disabled={pending} style={dangerButtonStyle}>
        Demander l'effacement irréversible
      </button>
    </form>
  );
}

const formStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 16,
};
const fieldLabelStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 8,
};
const inputStyle = {
  padding: 8,
  fontFamily: 'monospace',
  fontSize: 14,
  border: '1px solid #d1d5db',
  borderRadius: 4,
};
const dangerButtonStyle = {
  background: '#dc2626',
  color: '#fff',
  padding: '12px 24px',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer' as const,
  alignSelf: 'flex-start' as const,
};
const errorStyle = {
  background: '#fef2f2',
  border: '1px solid #ef4444',
  color: '#7f1d1d',
  padding: 12,
  borderRadius: 6,
};
const successStyle = {
  background: '#f0fdf4',
  border: '1px solid #16a34a',
  color: '#14532d',
  padding: 12,
  borderRadius: 6,
  display: 'block',
};
