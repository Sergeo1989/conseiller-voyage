// T071 — Barrel public du slice intake.
//
// Tous les composants UI + Server Actions exposés ici sont consommables
// par les pages `app/[locale]/(public)/voyage/*` et `app/[locale]/(voyageur)/voyage/*`.
//
// Convention VIII.a §6 : les imports cross-slice/cross-app passent
// UNIQUEMENT par ce barrel — jamais via un chemin profond
// (`features/intake/ui/BriefFormWizard` interdit, utiliser
// `features/intake`).

// Server Actions
export {
  submitBriefAction,
  type SubmitBriefActionResult,
} from './actions/submit-brief.action';
export {
  verifyMagicLinkAction,
  type VerifyMagicLinkActionResult,
} from './actions/verify-magic-link.action';
export {
  resendMagicLinkAction,
  type ResendMagicLinkActionResult,
} from './actions/resend-magic-link.action';

// UI components
export { BriefFormWizard } from './ui/BriefFormWizard';
export { BriefRecap } from './ui/BriefRecap';
export { BriefStatusBadge } from './ui/BriefStatusBadge';
export { EmailSentNotice } from './ui/EmailSentNotice';
export { MagicLinkExpiredNotice } from './ui/MagicLinkExpiredNotice';
export { OtherBriefsLink } from './ui/OtherBriefsLink';

// Server-side data fetchers (US2)
export { fetchBriefById, fetchBriefsByEmail } from './infrastructure/fetch-brief';
