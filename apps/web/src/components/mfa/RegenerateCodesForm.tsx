'use client';

// RegenerateCodesForm — Client Component qui déclenche la régénération
// via Server Action puis affiche les 10 nouveaux codes (one-shot).

import { useState, useTransition } from 'react';
import { regenerateBackupCodesAction } from '../../lib/mfa/device-change-server-actions';
import { BackupCodesDisplay } from './BackupCodesDisplay';

export function RegenerateCodesForm() {
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = (): void => {
    setError(null);
    startTransition(async () => {
      const result = await regenerateBackupCodesAction();
      if (result.kind === 'ok') {
        setNewCodes(result.backupCodes);
        return;
      }
      if (result.kind === 'stepup_required') {
        setError(
          "Votre session MFA n'est pas suffisamment récente. Reconnectez-vous puis réessayez. " +
            'Le composant step-up modal sera intégré dans le layout privé dans une phase ultérieure.',
        );
        return;
      }
      setError(`Erreur inattendue : ${result.message ?? 'inconnue'}.`);
    });
  };

  if (newCodes) {
    return (
      <div className="space-y-6">
        <output className="block rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          ✓ Vos 10 nouveaux codes de récupération ont été générés. Sauvegardez-les avant de quitter
          cette page — ils ne seront plus jamais ré-affichés.
        </output>
        <BackupCodesDisplay codes={newCodes} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Attention :</strong> cliquer sur ce bouton invalide IMMÉDIATEMENT vos 10 codes
        actuels. Vous ne pourrez plus les utiliser pour vous reconnecter en cas de perte de votre
        device TOTP. Assurez-vous de sauvegarder le nouveau lot avant de fermer cette page.
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isPending ? 'Génération…' : 'Régénérer mes 10 codes de récupération'}
      </button>
    </div>
  );
}
