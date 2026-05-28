// API publique de la feature profil-public (vue anti-marketplace,
// Principe I — conformité OPC/TICO).

export { BadgeVerifie } from './ui/BadgeVerifie';
export { CtaSuggested } from './ui/CtaSuggested';
export { ProfilHero } from './ui/ProfilHero';
export { ProfilSections } from './ui/ProfilSections';
export { SectionPourquoiPasContact } from './ui/SectionPourquoiPasContact';
export { lireProfilPublicBySlug, lireSlugsPubliables } from './infrastructure/public-reader';
export {
  UUID_V4_REGEX,
  appendEntry,
  decodeSuggestedCookie,
  encodeSuggestedCookie,
} from './lib/cv-suggested-edge';
