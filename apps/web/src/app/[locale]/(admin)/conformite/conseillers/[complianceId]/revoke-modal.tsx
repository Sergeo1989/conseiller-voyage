// T105 — Modal de révocation conseiller (US4 FR-010).
// Composant client interactif : textarea motif ≥ 20 chars + confirmation
// explicite avant action irréversible.

'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { revokeConseillerAction } from './actions';

const MIN_REASON = 20;
const MAX_REASON = 2000;

interface RevokeModalProps {
  readonly complianceId: string;
  readonly locale: string;
}

export function RevokeModal({ complianceId, locale }: RevokeModalProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);

    if (reason.trim().length < MIN_REASON) {
      setError(`Motif requis : minimum ${MIN_REASON} caractères.`);
      return;
    }
    if (confirmText !== 'RÉVOQUER') {
      setError('Tapez RÉVOQUER pour confirmer.');
      return;
    }

    startTransition(async () => {
      const result = await revokeConseillerAction(complianceId, { reason: reason.trim() }, locale);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setOpen(false);
    });
  }

  if (success) {
    return (
      <output style={successStyle}>
        Conseiller révoqué. Le statut est désormais "Révoqué" (état final).
      </output>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={triggerStyle}>
        Révoquer ce conseiller
      </button>
    );
  }

  return (
    <dialog open style={modalStyle} aria-labelledby="revoke-title">
      <h3 id="revoke-title" style={{ margin: '0 0 12px', color: '#dc2626' }}>
        Confirmation de révocation
      </h3>
      <p style={{ color: '#7f1d1d' }}>
        Cette action est <strong>irréversible</strong>. Le conseiller bascule immédiatement en
        statut <strong>Révoqué</strong> et n'est plus visible aux voyageurs. Il peut soumettre un
        nouveau dossier pour repartir à zéro (US4 acceptance #2).
      </p>
      <form onSubmit={handleSubmit} style={formStyle}>
        {error && (
          <p style={errorStyle} role="alert">
            {error}
          </p>
        )}
        <label style={fieldLabelStyle}>
          Motif (≥ 20 chars, communiqué au conseiller par email)
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={MIN_REASON}
            maxLength={MAX_REASON}
            rows={4}
            required
            style={inputStyle}
          />
          <small style={{ color: '#6b7280' }}>
            {reason.trim().length}/{MIN_REASON}
          </small>
        </label>
        <label style={fieldLabelStyle}>
          Pour confirmer, tapez <code>RÉVOQUER</code>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            required
            style={inputStyle}
          />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={pending} style={revokeButtonStyle}>
            Révoquer définitivement
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setReason('');
              setConfirmText('');
            }}
            style={cancelButtonStyle}
          >
            Annuler
          </button>
        </div>
      </form>
    </dialog>
  );
}

const triggerStyle = {
  background: '#dc2626',
  color: '#fff',
  padding: '10px 20px',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer' as const,
};
const modalStyle = {
  background: '#fef2f2',
  border: '2px solid #dc2626',
  borderRadius: 8,
  padding: 24,
  margin: '24px 0',
};
const formStyle = { display: 'flex', flexDirection: 'column' as const, gap: 12 };
const fieldLabelStyle = { display: 'flex', flexDirection: 'column' as const, gap: 4 };
const inputStyle = {
  padding: 8,
  fontFamily: 'inherit',
  fontSize: 14,
  border: '1px solid #d1d5db',
  borderRadius: 4,
};
const revokeButtonStyle = {
  background: '#dc2626',
  color: '#fff',
  padding: '10px 20px',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer' as const,
};
const cancelButtonStyle = {
  background: '#fff',
  color: '#1f2937',
  padding: '10px 20px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  cursor: 'pointer' as const,
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
