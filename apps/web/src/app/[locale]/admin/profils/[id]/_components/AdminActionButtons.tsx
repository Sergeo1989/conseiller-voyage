'use client';

// AdminActionButtons (T122) — orchestrateur Client des 3 actions admin.
//
// Affiche les boutons selon le statut courant du profil :
//   - incomplet : (Masquer)
//   - pret      : Retirer photo + Masquer
//   - masque_admin : Rétablir
//   - anonymise : aucun (rendu zéro côté page parente)
//
// Chaque bouton ouvre un DialogConfirmationAction qui appelle la
// Server Action correspondante.

import { DialogConfirmationAction } from '../../_components/DialogConfirmationAction';
import { masquerProfilAction, retablirProfilAction, retirerPhotoAction } from '../../actions';

interface AdminActionButtonsProps {
  readonly profilId: string;
  readonly statut: 'incomplet' | 'pret' | 'masque_admin';
  readonly hasPhoto: boolean;
  readonly profilLibelle: string;
  readonly locale: string;
}

export function AdminActionButtons({
  profilId,
  statut,
  hasPhoto,
  profilLibelle,
  locale,
}: AdminActionButtonsProps) {
  return (
    <div style={buttonRowStyle}>
      {hasPhoto && statut !== 'masque_admin' && (
        <DialogConfirmationAction
          actionKind="retirer-photo"
          profilLibelle={profilLibelle}
          onConfirm={(raison) => retirerPhotoAction({ profilId, raison, locale })}
          trigger={
            <button type="button" style={destructiveButtonStyle}>
              Retirer la photo
            </button>
          }
        />
      )}

      {statut !== 'masque_admin' && (
        <DialogConfirmationAction
          actionKind="masquer"
          profilLibelle={profilLibelle}
          onConfirm={(raison) => masquerProfilAction({ profilId, raison, locale })}
          trigger={
            <button type="button" style={warningButtonStyle}>
              Masquer le profil
            </button>
          }
        />
      )}

      {statut === 'masque_admin' && (
        <DialogConfirmationAction
          actionKind="retablir"
          profilLibelle={profilLibelle}
          onConfirm={(raison) =>
            retablirProfilAction({
              profilId,
              locale,
              ...(raison && { raison }),
            })
          }
          trigger={
            <button type="button" style={constructiveButtonStyle}>
              Rétablir le profil
            </button>
          }
        />
      )}
    </div>
  );
}

const buttonRowStyle = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap' as const,
};

const baseButton = {
  padding: '10px 20px',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 500,
};

const destructiveButtonStyle = { ...baseButton, background: '#dc2626', color: '#fff' };
const warningButtonStyle = { ...baseButton, background: '#f59e0b', color: '#fff' };
const constructiveButtonStyle = { ...baseButton, background: '#10b981', color: '#fff' };
