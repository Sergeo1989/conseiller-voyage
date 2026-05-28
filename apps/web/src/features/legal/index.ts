// API publique de la feature legal — point d'entrée unique pour
// imports cross-feature (Principe VIII.a §6).

export { reacceptCguAction } from './actions/reaccept-cgu.action';
export { AcceptCguCheckbox } from './ui/AcceptCguCheckbox';
export { buildLegalMetadata, renderLegalPage } from './ui/page-helpers';
export {
  LEGAL_VERSION_COOKIE_NAME,
  fetchCurrentCguB2bVersion,
  readLegalVersionCookie,
} from './infrastructure/version-check';
export { loadLegalMdx } from './infrastructure/content-loader';
export type { LoadedLegalMdx } from './infrastructure/content-loader';
