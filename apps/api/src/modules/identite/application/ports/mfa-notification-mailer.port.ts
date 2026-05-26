// Port MfaNotificationMailer — envoi des courriels transactionnels MFA.
// Cf. specs/005-mfa-conseiller/spec.md FR-013, FR-020a, FR-026,
// FR-015e, FR-015f.
//
// Stub MVP (P1-3) : implémentation `infrastructure/ses-mfa-notification-mailer.ts`
// écrit dans la table `mfa_outbox_emails` et n'envoie rien réellement
// tant que 003 n'a pas branché AWS SES. Les méthodes sont déjà typées
// pour faciliter la migration.

export interface LoginLockedNoticePayload {
  readonly recipientUserId: string;
  readonly recipientEmail: string;
  readonly lockedUntil: Date;
  readonly attemptsInWindow: number;
}

export interface StepUpSessionKilledNoticePayload {
  readonly recipientUserId: string;
  readonly recipientEmail: string;
  readonly killedAt: Date;
  readonly actorIp: string; // abrégée
  readonly intendedAction: string;
}

export interface AdminResetNoticePayload {
  readonly recipientUserId: string;
  readonly recipientEmail: string;
  readonly resetAt: Date;
  readonly justification: string; // texte intégral
  readonly actorAdminName: string | null; // null côté conseiller (FR-026 — affiché "équipe support")
}

export interface DeviceChangedNoticePayload {
  readonly recipientUserId: string;
  readonly recipientEmail: string;
  readonly changedAt: Date;
  readonly actorIp: string; // abrégée
}

export interface DeviceChangeIncompleteNoticePayload {
  readonly recipientUserId: string;
  readonly recipientEmail: string;
  readonly startedAt: Date;
}

export interface MfaNotificationMailer {
  sendLoginLockedNotice(payload: LoginLockedNoticePayload): Promise<void>;
  sendStepUpSessionKilledNotice(payload: StepUpSessionKilledNoticePayload): Promise<void>;
  sendAdminResetNotice(payload: AdminResetNoticePayload): Promise<void>;
  sendDeviceChangedNotice(payload: DeviceChangedNoticePayload): Promise<void>;
  sendDeviceChangeIncompleteNotice(payload: DeviceChangeIncompleteNoticePayload): Promise<void>;
}

export const MFA_NOTIFICATION_MAILER = Symbol.for('MfaNotificationMailer');
