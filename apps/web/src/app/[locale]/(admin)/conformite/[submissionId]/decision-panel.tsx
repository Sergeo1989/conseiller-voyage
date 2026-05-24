// T079 — Panneau client Approve/Refuse.
// Composant client interactif (textarea, états optimistes). Le bouton
// approve poste un commentaire optionnel ; refuse pose un motif ≥ 20
// chars.

'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { approveSubmissionAction, refuseSubmissionAction } from './actions';

const MIN_REFUSAL_CHARS = 20;
const MAX_COMMENT_CHARS = 500;
const MAX_REFUSAL_CHARS = 2000;

interface DecisionPanelProps {
  readonly submissionId: string;
  readonly locale: string;
  /** Si la submission est déjà décidée, on désactive les actions. */
  readonly alreadyDecided: boolean;
}

export function DecisionPanel({
  submissionId,
  locale,
  alreadyDecided,
}: DecisionPanelProps): JSX.Element {
  const t = useTranslations('conformite.admin.detail');
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (alreadyDecided) {
    return (
      <section style={panelStyle} aria-labelledby="actions-heading">
        <h2 id="actions-heading">{t('actionsTitle')}</h2>
        <p style={alreadyDecidedStyle}>{t('alreadyDecided')}</p>
      </section>
    );
  }

  async function handleApprove(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await approveSubmissionAction(
        submissionId,
        { ...(comment.trim() && { comment: comment.trim() }) },
        locale,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(t('approveSuccess'));
      router.refresh();
    });
  }

  async function handleRefuse(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (reason.trim().length < MIN_REFUSAL_CHARS) {
      setError(t('refuseReasonTooShort'));
      return;
    }
    startTransition(async () => {
      const result = await refuseSubmissionAction(submissionId, { reason: reason.trim() }, locale);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(t('refuseSuccess'));
      router.refresh();
    });
  }

  return (
    <section style={panelStyle} aria-labelledby="actions-heading">
      <h2 id="actions-heading">{t('actionsTitle')}</h2>

      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}
      {success && <output style={successStyle}>{success}</output>}

      {/* Approve form */}
      <form onSubmit={handleApprove} style={formStyle}>
        <label style={fieldLabelStyle}>
          {t('approveCommentLabel')}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={MAX_COMMENT_CHARS}
            rows={3}
            placeholder={t('approveCommentPlaceholder')}
            style={textareaStyle}
          />
          <small style={{ color: '#6b7280' }}>{t('approveCommentHelp')}</small>
        </label>
        <button type="submit" disabled={pending} style={approveButtonStyle}>
          {t('approveButton')}
        </button>
      </form>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

      {/* Refuse form */}
      <form onSubmit={handleRefuse} style={formStyle}>
        <label style={fieldLabelStyle}>
          {t('refuseReasonLabel')}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            minLength={MIN_REFUSAL_CHARS}
            maxLength={MAX_REFUSAL_CHARS}
            rows={4}
            required
            style={textareaStyle}
          />
          <small style={{ color: '#6b7280' }}>
            {t('refuseReasonHelp')} ({reason.trim().length}/{MIN_REFUSAL_CHARS})
          </small>
        </label>
        <button type="submit" disabled={pending} style={refuseButtonStyle}>
          {t('refuseButton')}
        </button>
      </form>
    </section>
  );
}

// --- Styles ---

const panelStyle = {
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 24,
  marginTop: 24,
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 12,
};

const fieldLabelStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 4,
};

const textareaStyle = {
  width: '100%',
  padding: 8,
  fontFamily: 'inherit',
  fontSize: 14,
  border: '1px solid #d1d5db',
  borderRadius: 4,
};

const approveButtonStyle = {
  background: '#16a34a',
  color: '#fff',
  padding: '10px 20px',
  border: 'none',
  borderRadius: 6,
  fontSize: 15,
  cursor: 'pointer' as const,
  alignSelf: 'flex-start' as const,
};

const refuseButtonStyle = {
  ...approveButtonStyle,
  background: '#dc2626',
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
};

const alreadyDecidedStyle = {
  color: '#6b7280',
  fontStyle: 'italic' as const,
};
