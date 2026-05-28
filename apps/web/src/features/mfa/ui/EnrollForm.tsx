'use client';

// EnrollForm — Client Component qui orchestre le flow d'enrôlement US1.
// Reçoit en props le résultat de startEnrollmentAction (Server Component
// parent) puis gère interactivement :
//   1. Affichage QR (image générée par qrcode lib côté Server Component
//      passé en data URL) + secret texte copiable.
//   2. Affichage one-shot des 10 backup codes (FR-005, via
//      <BackupCodesDisplay/>).
//   3. Saisie du 1er code TOTP (FR-003).
//   4. Checkbox FR-006 obligatoire avant submit.
//   5. Submit → confirmEnrollmentAction → redirect vers tableau de bord
//      conseiller (qui pour 005 phase 3 = /[locale] page d'accueil).

import { confirmEnrollmentAction } from '@/features/mfa';
import { toUrlLocale } from '@/i18n';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { BackupCodesDisplay } from './BackupCodesDisplay';
import { TotpInput } from './TotpInput';

export interface EnrollFormProps {
  readonly enrollmentRequestId: string;
  readonly qrCodeDataUrl: string;
  readonly secretBase32: string;
  readonly backupCodes: readonly string[];
}

export function EnrollForm({
  enrollmentRequestId,
  qrCodeDataUrl,
  secretBase32,
  backupCodes,
}: EnrollFormProps) {
  const locale = useLocale();
  const router = useRouter();
  const [totpCode, setTotpCode] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canSubmit = totpCode.length === 6 && acknowledged && !isPending;

  const handleCopySecret = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(secretBase32);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      // Silent fallback — l'utilisateur peut sélectionner manuellement.
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher d'erreur typé sur 4 cas distincts — extraire serait artificiel
    startTransition(async () => {
      const formData = new FormData();
      formData.set('enrollmentRequestId', enrollmentRequestId);
      formData.set('totpCode', totpCode);
      formData.set('backupCodesAcknowledged', 'true');
      const result = await confirmEnrollmentAction(formData);
      if (result.kind === 'ok') {
        router.push(`/${toUrlLocale(locale)}`);
        return;
      }
      if (result.kind === 'invalid_totp') {
        setError(
          'Le code à 6 chiffres est invalide. Vérifiez votre application TOTP et réessayez.',
        );
        setTotpCode('');
        return;
      }
      if (result.kind === 'backup_codes_not_acknowledged') {
        setError('Vous devez confirmer avoir sauvegardé vos codes de récupération.');
        return;
      }
      if (result.kind === 'enrollment_not_found') {
        setError("Le flow d'enrôlement a expiré. Rechargez la page pour recommencer.");
        return;
      }
      setError('Une erreur inattendue est survenue. Réessayez ou contactez le support.');
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section
        aria-labelledby="qr-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <h2 id="qr-heading" className="mb-2 text-lg font-semibold">
          1. Scannez le QR code avec votre application TOTP
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          Compatible Google Authenticator, 1Password, Authy, Microsoft Authenticator, etc.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <img
            src={qrCodeDataUrl}
            alt="QR code à scanner avec votre application TOTP"
            width={200}
            height={200}
            className="rounded border border-slate-300 bg-white"
          />
          <div className="flex-1">
            <p className="mb-1 text-sm text-slate-600">Ou saisissez ce secret manuellement :</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-slate-100 p-2 font-mono text-sm">
                {secretBase32}
              </code>
              <button
                type="button"
                onClick={handleCopySecret}
                aria-live="polite"
                className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
              >
                {secretCopied ? 'Copié ✓' : 'Copier'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <BackupCodesDisplay codes={backupCodes} />

      <section
        aria-labelledby="totp-heading"
        className="rounded-lg border border-slate-200 bg-white p-6"
      >
        <h2 id="totp-heading" className="mb-2 text-lg font-semibold">
          2. Saisissez le code à 6 chiffres de votre application
        </h2>
        <p id="totp-help" className="mb-4 text-sm text-slate-600">
          Votre application TOTP affiche un code qui change toutes les 30 secondes. Saisissez celui
          actuellement affiché pour confirmer que votre device est bien configuré.
        </p>
        <TotpInput
          value={totpCode}
          onChange={setTotpCode}
          disabled={isPending}
          inputId="totp-code"
          describedById="totp-help"
          autoFocus
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={isPending}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>
            J'ai sauvegardé mes 10 codes de récupération en lieu sûr (téléchargés ou recopiés).
            <strong> Ces codes ne seront jamais ré-affichés.</strong>
          </span>
        </label>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? 'Vérification…' : 'Activer MFA et accéder à mon tableau de bord'}
        </button>
      </div>
    </form>
  );
}
