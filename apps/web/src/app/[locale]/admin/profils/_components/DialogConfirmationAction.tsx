'use client';

// T123 — Dialog de confirmation pour les actions admin destructives
// (retirer photo, masquer, rétablir). Radix Dialog → focus trap +
// aria-modal + Escape fermeture + restauration focus déclencheur.
//
// Trois variantes :
//   - 'retirer-photo' : exige raison ≥ 10 chars (audit FR-023)
//   - 'masquer'       : exige raison ≥ 10 chars (audit FR-023)
//   - 'retablir'      : raison optionnelle
//
// Le caller passe `onConfirm(raison)` → Server Action correspondante.

import * as Dialog from '@radix-ui/react-dialog';
import { type FormEvent, useState, useTransition } from 'react';

export type AdminActionKind = 'retirer-photo' | 'masquer' | 'retablir';

interface DialogConfirmationActionProps {
  readonly trigger: React.ReactNode;
  readonly actionKind: AdminActionKind;
  readonly profilLibelle: string;
  readonly onConfirm: (raison: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

const ACTION_LABELS: Record<
  AdminActionKind,
  { titre: string; submit: string; description: string }
> = {
  'retirer-photo': {
    titre: 'Retirer la photo du profil',
    submit: 'Retirer la photo',
    description:
      "Cette action supprimera définitivement la photo S3 + l'historique FIFO. Le statut passera à incomplet (page publique disparaîtra). Le conseiller recevra un courriel.",
  },
  masquer: {
    titre: 'Masquer le profil temporairement',
    submit: 'Masquer le profil',
    description:
      "Le profil sera retiré de la liste publique et des résultats matching jusqu'au rétablissement. Le conseiller recevra un courriel avec la raison.",
  },
  retablir: {
    titre: 'Rétablir le profil',
    submit: 'Rétablir',
    description:
      'Le profil reprendra son statut effectif (prêt si conformité + champs OK ; sinon incomplet). Pas de courriel automatique.',
  },
};

function placeholderFor(actionKind: AdminActionKind): string {
  if (actionKind === 'retirer-photo') {
    return 'ex. Photo inappropriée — visage flou non-conforme';
  }
  if (actionKind === 'masquer') {
    return 'ex. Signalement utilisateur — vérification en cours';
  }
  return 'ex. Conformité rétablie suite à vérification';
}

interface DialogFormProps {
  readonly actionKind: AdminActionKind;
  readonly profilLibelle: string;
  readonly raison: string;
  readonly setRaison: (v: string) => void;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

function DialogForm({
  actionKind,
  profilLibelle,
  raison,
  setRaison,
  error,
  isPending,
  onSubmit,
}: DialogFormProps) {
  const labels = ACTION_LABELS[actionKind];
  const exigeRaison = actionKind !== 'retablir';
  const peutSoumettre = !exigeRaison || raison.trim().length >= 10;

  return (
    <>
      <Dialog.Title style={titleStyle}>{labels.titre}</Dialog.Title>
      <p id="dialog-action-description" style={descriptionStyle}>
        <strong>Profil :</strong> {profilLibelle}
      </p>
      <p style={descriptionStyle}>{labels.description}</p>

      <form onSubmit={onSubmit}>
        <label htmlFor="raison-textarea" style={labelStyle}>
          Raison {exigeRaison ? '(min. 10 caractères, obligatoire)' : '(facultative)'}
        </label>
        <textarea
          id="raison-textarea"
          value={raison}
          onChange={(e) => setRaison(e.target.value)}
          rows={4}
          required={exigeRaison}
          minLength={exigeRaison ? 10 : 0}
          maxLength={500}
          style={textareaStyle}
          placeholder={placeholderFor(actionKind)}
        />
        {exigeRaison && (
          <p style={countStyle}>
            {raison.trim().length} / 500 caractères
            {raison.trim().length < 10 && raison.length > 0 && ' (min. 10)'}
          </p>
        )}

        {error && (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        )}

        <div style={buttonBarStyle}>
          <Dialog.Close asChild>
            <button type="button" style={cancelButtonStyle} disabled={isPending}>
              Annuler
            </button>
          </Dialog.Close>
          <button
            type="submit"
            style={
              !peutSoumettre || isPending
                ? { ...submitButtonStyle, ...disabledStyle }
                : submitButtonStyle
            }
            disabled={!peutSoumettre || isPending}
          >
            {isPending ? 'En cours…' : labels.submit}
          </button>
        </div>
      </form>
    </>
  );
}

export function DialogConfirmationAction({
  trigger,
  actionKind,
  profilLibelle,
  onConfirm,
}: DialogConfirmationActionProps) {
  const [open, setOpen] = useState(false);
  const [raison, setRaison] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const exigeRaison = actionKind !== 'retablir';
  const peutSoumettre = !exigeRaison || raison.trim().length >= 10;

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!peutSoumettre || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await onConfirm(raison.trim());
      if (result.ok) {
        setOpen(false);
        setRaison('');
      } else {
        setError(result.error);
      }
    });
  };

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (!next) {
      setRaison('');
      setError(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle} />
        <Dialog.Content style={contentStyle} aria-describedby="dialog-action-description">
          <DialogForm
            actionKind={actionKind}
            profilLibelle={profilLibelle}
            raison={raison}
            setRaison={setRaison}
            error={error}
            isPending={isPending}
            onSubmit={handleSubmit}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const overlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  zIndex: 100,
};

const contentStyle = {
  position: 'fixed' as const,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  background: '#fff',
  borderRadius: 8,
  padding: '24px 28px',
  width: '90vw',
  maxWidth: 540,
  maxHeight: '85vh',
  overflowY: 'auto' as const,
  zIndex: 101,
  boxShadow: '0 10px 38px rgba(0, 0, 0, 0.15)',
};

const titleStyle = { margin: '0 0 12px 0', fontSize: 20, color: '#1f2937' };

const descriptionStyle = { margin: '8px 0', color: '#4b5563', fontSize: 14, lineHeight: 1.5 };

const labelStyle = { display: 'block', margin: '16px 0 6px 0', fontWeight: 500, color: '#1f2937' };

const textareaStyle = {
  width: '100%',
  padding: 10,
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontFamily: 'inherit',
  fontSize: 14,
  resize: 'vertical' as const,
  boxSizing: 'border-box' as const,
};

const countStyle = { fontSize: 12, color: '#6b7280', margin: '4px 0 0 0' };

const errorStyle = {
  background: '#fef2f2',
  color: '#991b1b',
  padding: '10px 12px',
  borderRadius: 4,
  margin: '12px 0 0 0',
  fontSize: 14,
};

const buttonBarStyle = {
  display: 'flex',
  justifyContent: 'flex-end' as const,
  gap: 10,
  marginTop: 20,
};

const cancelButtonStyle = {
  padding: '8px 16px',
  background: '#f3f4f6',
  color: '#1f2937',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
};

const submitButtonStyle = {
  padding: '8px 16px',
  background: '#dc2626',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
};

const disabledStyle = {
  opacity: 0.5,
  cursor: 'not-allowed',
};
