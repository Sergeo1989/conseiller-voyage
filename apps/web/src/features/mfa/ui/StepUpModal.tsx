'use client';

// StepUpModal — Radix Dialog pour le step-up TOTP intra-session (US2).
//
// Conformément à FR-019 et FR-036 :
//   - Focus piégé dans le modal (Radix gère)
//   - aria-labelledby + aria-modal="true" (Radix gère)
//   - Touche Escape fonctionnelle (fermeture sans validation)
//   - Restauration du focus au déclencheur à la fermeture (Radix)
//
// Comportement :
//   - L'utilisateur saisit son code TOTP à 6 chiffres.
//   - Submit → stepUpAction Server Action.
//   - Sur succès : onSuccess() callback (puis le caller exécute l'action
//     sensible originelle).
//   - Sur kind 'invalid' : affiche tentatives restantes.
//   - Sur kind 'session_killed' : redirect /login.
//   - Fermeture du modal : l'action sensible reste verrouillée
//     (lecture seule).

import { stepUpAction } from '@/features/mfa/actions/stepup.actions';
import type { IntendedAction } from '@cv/mfa';
import * as Dialog from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { TotpInput } from './TotpInput';

export interface StepUpModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly intendedAction: IntendedAction;
  readonly intendedActionLabel: string;
  readonly onSuccess: () => void;
}

export function StepUpModal({
  open,
  onOpenChange,
  intendedAction,
  intendedActionLabel,
  onSuccess,
}: StepUpModalProps) {
  const router = useRouter();
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = (): void => {
    setTotpCode('');
    setError(null);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (totpCode.length !== 6 || isPending) return;
    setError(null);
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatcher 4 cas
    startTransition(async () => {
      const formData = new FormData();
      formData.set('totpCode', totpCode);
      formData.set('intendedAction', intendedAction);
      const result = await stepUpAction(formData);
      if (result.kind === 'ok') {
        reset();
        onOpenChange(false);
        onSuccess();
        return;
      }
      if (result.kind === 'invalid') {
        setError(
          result.attemptsRemaining > 0
            ? `Code invalide. ${result.attemptsRemaining} tentative${
                result.attemptsRemaining > 1 ? 's' : ''
              } restante${result.attemptsRemaining > 1 ? 's' : ''}.`
            : 'Code invalide.',
        );
        setTotpCode('');
        return;
      }
      if (result.kind === 'session_killed') {
        router.push('/login?reason=stepup_failed');
        return;
      }
      setError('Erreur inattendue. Réessayez ou rechargez la page.');
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl focus:outline-none">
          <Dialog.Title className="mb-2 text-lg font-semibold">
            Confirmer votre identité
          </Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-slate-600">
            Pour des raisons de sécurité, veuillez saisir le code à 6 chiffres affiché par votre
            application TOTP avant de continuer vers <strong>{intendedActionLabel}</strong>.
          </Dialog.Description>
          <form onSubmit={handleSubmit} className="space-y-4">
            <TotpInput
              value={totpCode}
              onChange={setTotpCode}
              disabled={isPending}
              autoFocus
              inputId="stepup-totp-code"
              describedById="stepup-totp-help"
            />
            <p id="stepup-totp-help" className="text-xs text-slate-500">
              Le code change toutes les 30 secondes.
            </p>
            {error && (
              <p
                role="alert"
                className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                  disabled={isPending}
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={totpCode.length !== 6 || isPending}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isPending ? 'Vérification…' : 'Confirmer'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
