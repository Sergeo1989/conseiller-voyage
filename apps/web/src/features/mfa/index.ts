// API publique de la feature mfa (MFA conseiller + admin — feature 005/006).
// Conforme à Principe VIII.a §3 : un verbe = un fichier <verbe>.action.ts.

export { startEnrollmentAction } from './actions/start-enrollment.action';
export type { StartEnrollmentResult } from './actions/start-enrollment.action';

export { confirmEnrollmentAction } from './actions/confirm-enrollment.action';
export type { ConfirmEnrollmentResult } from './actions/confirm-enrollment.action';

export { verifyTotpAction } from './actions/verify-totp.action';
export type { VerifyTotpActionResult } from './actions/verify-totp.action';

export { verifyBackupCodeAction } from './actions/verify-backup-code.action';
export type { VerifyBackupCodeActionResult } from './actions/verify-backup-code.action';

export { stepUpAction } from './actions/step-up.action';
export type { StepUpActionResult } from './actions/step-up.action';

export { checkSessionFreshnessAction } from './actions/check-session-freshness.action';
export type { SessionFreshnessResult } from './actions/check-session-freshness.action';

export { startDeviceChangeAction } from './actions/start-device-change.action';
export type { StartDeviceChangeResult } from './actions/start-device-change.action';

export { regenerateBackupCodesAction } from './actions/regenerate-backup-codes.action';
export type { RegenerateBackupCodesResult } from './actions/regenerate-backup-codes.action';

export { resetUserMfaAdminAction } from './actions/reset-user-mfa-admin.action';
export type { ResetUserMfaAdminResult } from './actions/reset-user-mfa-admin.action';

export { useStepUpGate } from './lib/stepup-client';
export type { StepUpGate } from './lib/stepup-client';

export { AdminResetForm } from './ui/AdminResetForm';
export { BackupCodesDisplay } from './ui/BackupCodesDisplay';
export { DeviceChangeForm } from './ui/DeviceChangeForm';
export { EnrollForm } from './ui/EnrollForm';
export { RegenerateCodesForm } from './ui/RegenerateCodesForm';
export { StepUpModal } from './ui/StepUpModal';
export { TotpInput } from './ui/TotpInput';
export { VerifyBackupCodeForm } from './ui/VerifyBackupCodeForm';
export { VerifyTotpForm } from './ui/VerifyTotpForm';
