// API publique de la feature auth.
// Conforme à Principe VIII.a §3 : un verbe = un fichier <verbe>.action.ts.

export { signupAction } from './actions/signup.action';
export type { SignupResult } from './actions/signup.action';

export { loginAction } from './actions/login.action';
export type { LoginResult } from './actions/login.action';

export { logoutAction } from './actions/logout.action';

export { resendVerificationEmailAction } from './actions/resend-verification-email.action';
export type { ResendResult } from './actions/resend-verification-email.action';

export { requestPasswordResetAction } from './actions/request-password-reset.action';
export type { RequestResetResult } from './actions/request-password-reset.action';

export { completePasswordResetAction } from './actions/complete-password-reset.action';
export type { CompleteResetResult } from './actions/complete-password-reset.action';

export { changePasswordAction } from './actions/change-password.action';
export type { ChangePasswordResult } from './actions/change-password.action';

export { inviteAdminAction } from './actions/invite-admin.action';
export type { InviteAdminResult } from './actions/invite-admin.action';

export { acceptAdminInvitationAction } from './actions/accept-admin-invitation.action';
export type { AcceptInvitationResult } from './actions/accept-admin-invitation.action';

export { devLoginAction, devLogoutAction } from './actions/dev-login.action';
export type { DevLoginRole } from './actions/dev-login.action';

export { AcceptAdminInvitationForm } from './ui/AcceptAdminInvitationForm';
export { ChangePasswordForm } from './ui/ChangePasswordForm';
export { InviteAdminForm } from './ui/InviteAdminForm';
export { LoginForm } from './ui/LoginForm';
export { PasswordResetCompleteForm } from './ui/PasswordResetCompleteForm';
export { PasswordResetRequestForm } from './ui/PasswordResetRequestForm';
export { ResendCountdownButton } from './ui/ResendCountdownButton';
export { SignupForm } from './ui/SignupForm';
