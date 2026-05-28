// API publique de la feature profil-conseiller (édition profil privé,
// upload photo, aperçu — feature 007).
//
// TODO Principe VIII.a §3 (convention <verbe>.action.ts) : le fichier
// `actions/profil.actions.ts` regroupe encore 4 actions ; à splitter en
// editer-profil / uploader-photo / lire-profil-prive / lire-profil-apercu
// dans un PR de refactor séparé (extraire helpers partagés dans `lib/`).

export {
  editerProfilAction,
  uploaderPhotoAction,
  lireProfilApercuAction,
  lireProfilPriveAction,
} from './actions/profil.actions';
export type {
  EditerProfilResult,
  UploaderPhotoResult,
  ProfilPriveDto,
  ProfilApercuDto,
} from './actions/profil.actions';

export { ProfilForm } from './ui/ProfilForm';
export { PhotoUpload } from './ui/PhotoUpload';
export { AfficherNomCompletSwitch } from './ui/AfficherNomCompletSwitch';
export { BandeauApercu } from './ui/BandeauApercu';
