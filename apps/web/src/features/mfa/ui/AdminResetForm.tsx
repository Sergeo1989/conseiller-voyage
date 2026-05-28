'use client';

// AdminResetForm — Client Component pour /admin/users/[id]/reset-mfa (US4).

import { resetUserMfaAdminAction } from '@/features/mfa';
import { toUrlLocale } from '@/i18n';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';

export interface AdminResetFormProps {
  readonly targetUserId: string;
  readonly targetEmail: string | null;
  readonly targetRole: 'admin' | 'conseiller';
  readonly activeAdminsCount: number;
}

const MIN_JUSTIFICATION = 20;
const MAX_JUSTIFICATION = 1000;

export function AdminResetForm({
  targetUserId,
  targetEmail,
  targetRole,
  activeAdminsCount,
}: AdminResetFormProps) {
  const locale = useLocale();
  const router = useRouter();
  const [justification, setJustification] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // FR-026b — avertissement visible si reset du dernier autre admin
  // (compteur = 2 avant l'action).
  const isLastOtherAdmin = targetRole === 'admin' && activeAdminsCount === 2;

  const canSubmit =
    justification.trim().length >= MIN_JUSTIFICATION &&
    justification.length <= MAX_JUSTIFICATION &&
    !isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSuccessMessage(null);
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher 6 cas
    startTransition(async () => {
      const formData = new FormData();
      formData.set('targetUserId', targetUserId);
      formData.set('justification', justification);
      const result = await resetUserMfaAdminAction(formData);

      if (result.kind === 'ok') {
        setSuccessMessage(
          `MFA réinitialisé. ${result.sessionsRevokedCount} session${
            result.sessionsRevokedCount > 1 ? 's' : ''
          } révoquée${result.sessionsRevokedCount > 1 ? 's' : ''}. L'utilisateur recevra un courriel et devra refaire l'enrôlement à sa prochaine connexion.`,
        );
        setTimeout(() => router.push(`/${toUrlLocale(locale)}/admin`), 3000);
        return;
      }
      if (result.kind === 'self_reset_forbidden') {
        setError('Auto-reset interdit. Demandez à un autre admin (FR-022a).');
        return;
      }
      if (result.kind === 'target_not_found') {
        setError('Utilisateur cible introuvable.');
        return;
      }
      if (result.kind === 'target_not_enrolled') {
        setError("L'utilisateur cible n'a pas de MFA actif — rien à réinitialiser.");
        return;
      }
      if (result.kind === 'stepup_required') {
        setError(
          "Votre session MFA n'est pas suffisamment récente. Reconnectez-vous puis réessayez.",
        );
        return;
      }
      setError(`Erreur inattendue : ${result.message ?? 'inconnue'}.`);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm text-slate-700">
          <strong>Cible :</strong> {targetEmail ?? targetUserId} ({targetRole})
        </p>
      </section>

      {isLastOtherAdmin && (
        <output className="block rounded border-2 border-amber-400 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          ⚠ Vous êtes sur le point de verrouiller temporairement l'autre admin de la plateforme.
          Confirmer uniquement après accord hors-bande (FR-026b).
        </output>
      )}

      <div>
        <label htmlFor="justification" className="mb-2 block text-sm font-medium">
          Justification (≥ {MIN_JUSTIFICATION} caractères, archivée dans le journal d'audit)
        </label>
        <textarea
          id="justification"
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          disabled={isPending}
          rows={4}
          maxLength={MAX_JUSTIFICATION}
          required
          aria-describedby="justification-help"
          className="block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:bg-slate-100"
          placeholder="Reset demandé par l'utilisateur le YYYY-MM-DD à HH:MM. Identité vérifiée par téléphone au numéro déclaré + document d'identité."
        />
        <p id="justification-help" className="mt-1 text-xs text-slate-500">
          {justification.trim().length} / {MAX_JUSTIFICATION} caractères. La justification est
          immuable dans le journal d'audit (Loi 25 + Principe IX).
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      {successMessage && (
        <output className="block rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {successMessage}
        </output>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isPending}
          className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? 'Réinitialisation…' : 'Réinitialiser MFA'}
        </button>
      </div>
    </form>
  );
}
