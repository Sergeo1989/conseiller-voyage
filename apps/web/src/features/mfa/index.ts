// API publique de la feature mfa (MFA conseiller + admin — feature 005/006).
// TODO Principe VIII.a §3 : splitter chaque `*.actions.ts` en `<verbe>.action.ts`.

export * from './actions/enrollment.actions';
export * from './actions/verify.actions';
export * from './actions/stepup.actions';
export * from './actions/device-change.actions';
export * from './actions/admin-reset.actions';

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
