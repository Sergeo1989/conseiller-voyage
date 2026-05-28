// API publique de la feature admin-users (modération profils
// conseiller — retirer photo, masquer profil, rétablir profil).

export {
  retirerPhotoAction,
  masquerProfilAction,
  retablirProfilAction,
} from './actions/moderate-profil.action';
export type { AdminActionResult } from './actions/moderate-profil.action';

export { AdminActionButtons } from './ui/AdminActionButtons';
export { DialogConfirmationAction } from './ui/DialogConfirmationAction';
export type { AdminActionKind } from './ui/DialogConfirmationAction';
