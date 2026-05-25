// T100 — Formulaire client de déclaration de retrait de permis.
// Compteur live des caractères + preview de l'impact en cas de succès.

'use client';
import { type FormEvent, type ReactNode, useState, useTransition } from 'react';
import { declarePermitRevokedAction } from './actions';

const MIN_REASON = 20;
const MAX_REASON = 2000;

interface PermitRevokeFormProps {
  readonly locale: string;
}

export function PermitRevokeForm({ locale }: PermitRevokeFormProps): ReactNode {
  const [permitNumber, setPermitNumber] = useState('');
  const [province, setProvince] = useState<'QC' | 'ON'>('QC');
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    permitRevocationId: string;
    affectedConseillerCount: number;
    conseillerSuspensionCount: number;
  } | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (reason.trim().length < MIN_REASON) {
      setError('Motif requis : minimum 20 caractères.');
      return;
    }
    startTransition(async () => {
      const result = await declarePermitRevokedAction(
        {
          agencyPermitNumber: permitNumber.trim(),
          agencyProvince: province,
          reason: reason.trim(),
        },
        locale,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(result.data);
      setPermitNumber('');
      setReason('');
    });
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      {error && (
        <p style={errorStyle} role="alert">
          {error}
        </p>
      )}
      {success && (
        <output style={successStyle}>
          Permis révoqué (ID {success.permitRevocationId.slice(0, 8)}…).{' '}
          {success.affectedConseillerCount} conseiller(s) affecté(s),{' '}
          {success.conseillerSuspensionCount} basculé(s) en suspendu.
        </output>
      )}

      <label style={fieldLabelStyle}>
        Numéro de permis
        <input
          type="text"
          value={permitNumber}
          onChange={(e) => setPermitNumber(e.target.value)}
          maxLength={50}
          required
          style={inputStyle}
        />
      </label>

      <label style={fieldLabelStyle}>
        Province
        <select
          value={province}
          onChange={(e) => setProvince(e.target.value as 'QC' | 'ON')}
          style={inputStyle}
        >
          <option value="QC">Québec (OPC)</option>
          <option value="ON">Ontario (TICO)</option>
        </select>
      </label>

      <label style={fieldLabelStyle}>
        Motif (≥ 20 caractères, sera audité)
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

      <button type="submit" disabled={pending} style={buttonStyle}>
        Déclarer le retrait
      </button>
    </form>
  );
}

const formStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 16,
  maxWidth: 600,
};
const fieldLabelStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 4,
};
const inputStyle = {
  padding: 8,
  fontFamily: 'inherit',
  fontSize: 14,
  border: '1px solid #d1d5db',
  borderRadius: 4,
};
const buttonStyle = {
  background: '#dc2626',
  color: '#fff',
  padding: '10px 20px',
  border: 'none',
  borderRadius: 6,
  fontSize: 15,
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
