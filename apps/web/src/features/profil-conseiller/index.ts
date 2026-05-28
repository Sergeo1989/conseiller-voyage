// API publique de la feature profil-conseiller (édition profil privé,
// upload photo, aperçu — feature 007).
// Conforme à Principe VIII.a §3 : un verbe = un fichier <verbe>.action.ts.

export { editerProfilAction } from './actions/editer-profil.action';
export type { EditerProfilResult } from './actions/editer-profil.action';

export { uploaderPhotoAction } from './actions/uploader-photo.action';
export type { UploaderPhotoResult } from './actions/uploader-photo.action';

export { lireProfilPriveAction } from './actions/lire-profil-prive.action';
export type { ProfilPriveDto } from './actions/lire-profil-prive.action';

export { lireProfilApercuAction } from './actions/lire-profil-apercu.action';
export type { ProfilApercuDto } from './actions/lire-profil-apercu.action';

export { ProfilForm } from './ui/ProfilForm';
export { PhotoUpload } from './ui/PhotoUpload';
export { AfficherNomCompletSwitch } from './ui/AfficherNomCompletSwitch';
export { BandeauApercu } from './ui/BandeauApercu';
