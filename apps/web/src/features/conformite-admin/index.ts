// API publique de la feature conformite-admin (console admin —
// approbation/refus dossiers, révocation conseiller, déclaration
// retrait permis OPC/TICO).

export { approveSubmissionAction, refuseSubmissionAction } from './actions/decision.action';
export type { ApproveActionResult, RefuseActionResult } from './actions/decision.action';

export { revokeConseillerAction } from './actions/revoke-conseiller.action';
export type { RevokeActionResult } from './actions/revoke-conseiller.action';

export { declarePermitRevokedAction } from './actions/permit-revoke.action';
export type { DeclarePermitActionResult } from './actions/permit-revoke.action';

export { DecisionPanel } from './ui/DecisionPanel';
export { PermitRevokeForm } from './ui/PermitRevokeForm';
export { RevokeModal } from './ui/RevokeModal';
