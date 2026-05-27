// Catalogue central des templates react-email.
// Chaque entry mappe un `templateId` stable vers :
//   - `component` : fonction React (props → ReactElement)
//   - `subject`   : fonction (props, locale) → string
//
// Le templateId suit la convention '<module>.<template-name>'.
// Ce fichier est la source de vérité pour le renderer.
// Les templates non-implémentés lèveront TemplateRenderingError au render.

import {
  AdminInvitationEmail,
  EmailVerificationEmail,
  PasswordChangedEmail,
  PasswordResetEmail,
} from '@cv/email-templates/auth';
import {
  DossierApprovedEmail,
  DossierRefusedEmail,
  DossierSubmittedEmail,
  ErasureConfirmedEmail,
  ExpirationReminderEmail,
  RevocationEmail,
} from '@cv/email-templates/conformite';
import {
  AdminResetEmail,
  DeviceChangeIncompleteEmail,
  DeviceChangedEmail,
  LoginLockedEmail,
  StepUpSessionKilledEmail,
  TotpActivatedEmail,
} from '@cv/email-templates/mfa';
import type { ReactElement } from 'react';
import type { TemplateDef } from './react-email-renderer';

const SUBJECTS: Record<string, Record<string, string>> = {
  'auth.email-verification': {
    'fr-CA': 'Vérifiez votre adresse courriel',
    en: 'Verify your email address',
  },
  'auth.password-reset': {
    'fr-CA': 'Réinitialisez votre mot de passe',
    en: 'Reset your password',
  },
  'auth.password-changed': {
    'fr-CA': 'Votre mot de passe a été modifié',
    en: 'Your password has been changed',
  },
  'auth.admin-invitation': {
    'fr-CA': "Vous avez été invité(e) en tant qu'administrateur",
    en: 'You have been invited as an administrator',
  },
  'mfa.login-locked': {
    'fr-CA': 'Votre compte a été temporairement verrouillé',
    en: 'Your account has been temporarily locked',
  },
  'mfa.stepup-session-killed': {
    'fr-CA': "Session d'authentification expirée",
    en: 'Authentication session expired',
  },
  'mfa.admin-reset': {
    'fr-CA': 'Votre authentification MFA a été réinitialisée',
    en: 'Your MFA authentication has been reset',
  },
  'mfa.device-changed': {
    'fr-CA': "Appareil d'authentification modifié",
    en: 'Authentication device changed',
  },
  'mfa.device-change-incomplete': {
    'fr-CA': "Modification d'appareil incomplète",
    en: 'Device change incomplete',
  },
  'conformite.dossier-approved': {
    'fr-CA': 'Votre dossier de conformité a été approuvé',
    en: 'Your compliance file has been approved',
  },
  'conformite.dossier-refused': {
    'fr-CA': 'Votre dossier de conformité a été refusé',
    en: 'Your compliance file has been refused',
  },
  'conformite.dossier-submitted': {
    'fr-CA': 'Votre dossier a bien été soumis',
    en: 'Your file has been submitted',
  },
  'conformite.expiration-reminder': {
    'fr-CA': 'Rappel : votre certification expire bientôt',
    en: 'Reminder: your certification is expiring soon',
  },
  'conformite.revocation': {
    'fr-CA': 'Votre certification a été révoquée',
    en: 'Your certification has been revoked',
  },
  'conformite.erasure-confirmed': {
    'fr-CA': "Confirmation d'effacement de vos données personnelles",
    en: 'Confirmation of personal data erasure',
  },
  'mfa.totp-activated': {
    'fr-CA': 'Authentification à deux facteurs activée',
    en: 'Two-factor authentication activated',
  },
};

function subject(templateId: string) {
  return (_props: Record<string, unknown>, locale: string): string => {
    return SUBJECTS[templateId]?.[locale] ?? SUBJECTS[templateId]?.['fr-CA'] ?? templateId;
  };
}

export function buildEmailTemplateCatalogue(): ReadonlyMap<string, TemplateDef> {
  const catalogue = new Map<string, TemplateDef>();

  catalogue.set('auth.email-verification', {
    component: (props) =>
      EmailVerificationEmail(
        props as unknown as Parameters<typeof EmailVerificationEmail>[0],
      ) as ReactElement,
    subject: subject('auth.email-verification'),
  });

  catalogue.set('auth.password-reset', {
    component: (props) =>
      PasswordResetEmail(
        props as unknown as Parameters<typeof PasswordResetEmail>[0],
      ) as ReactElement,
    subject: subject('auth.password-reset'),
  });

  catalogue.set('auth.password-changed', {
    component: (props) =>
      PasswordChangedEmail(
        props as unknown as Parameters<typeof PasswordChangedEmail>[0],
      ) as ReactElement,
    subject: subject('auth.password-changed'),
  });

  catalogue.set('auth.admin-invitation', {
    component: (props) =>
      AdminInvitationEmail(
        props as unknown as Parameters<typeof AdminInvitationEmail>[0],
      ) as ReactElement,
    subject: subject('auth.admin-invitation'),
  });

  catalogue.set('mfa.login-locked', {
    component: (props) =>
      LoginLockedEmail(props as unknown as Parameters<typeof LoginLockedEmail>[0]) as ReactElement,
    subject: subject('mfa.login-locked'),
  });

  catalogue.set('mfa.stepup-session-killed', {
    component: (props) =>
      StepUpSessionKilledEmail(
        props as unknown as Parameters<typeof StepUpSessionKilledEmail>[0],
      ) as ReactElement,
    subject: subject('mfa.stepup-session-killed'),
  });

  catalogue.set('mfa.admin-reset', {
    component: (props) =>
      AdminResetEmail(props as unknown as Parameters<typeof AdminResetEmail>[0]) as ReactElement,
    subject: subject('mfa.admin-reset'),
  });

  catalogue.set('mfa.device-changed', {
    component: (props) =>
      DeviceChangedEmail(
        props as unknown as Parameters<typeof DeviceChangedEmail>[0],
      ) as ReactElement,
    subject: subject('mfa.device-changed'),
  });

  catalogue.set('mfa.device-change-incomplete', {
    component: (props) =>
      DeviceChangeIncompleteEmail(
        props as unknown as Parameters<typeof DeviceChangeIncompleteEmail>[0],
      ) as ReactElement,
    subject: subject('mfa.device-change-incomplete'),
  });

  catalogue.set('mfa.totp-activated', {
    component: (props) =>
      TotpActivatedEmail(
        props as unknown as Parameters<typeof TotpActivatedEmail>[0],
      ) as ReactElement,
    subject: subject('mfa.totp-activated'),
  });

  catalogue.set('conformite.dossier-approved', {
    component: (props) =>
      DossierApprovedEmail(
        props as unknown as Parameters<typeof DossierApprovedEmail>[0],
      ) as ReactElement,
    subject: subject('conformite.dossier-approved'),
  });

  catalogue.set('conformite.dossier-refused', {
    component: (props) =>
      DossierRefusedEmail(
        props as unknown as Parameters<typeof DossierRefusedEmail>[0],
      ) as ReactElement,
    subject: subject('conformite.dossier-refused'),
  });

  catalogue.set('conformite.dossier-submitted', {
    component: (props) =>
      DossierSubmittedEmail(
        props as unknown as Parameters<typeof DossierSubmittedEmail>[0],
      ) as ReactElement,
    subject: subject('conformite.dossier-submitted'),
  });

  catalogue.set('conformite.expiration-reminder', {
    component: (props) =>
      ExpirationReminderEmail(
        props as unknown as Parameters<typeof ExpirationReminderEmail>[0],
      ) as ReactElement,
    subject: subject('conformite.expiration-reminder'),
  });

  catalogue.set('conformite.revocation', {
    component: (props) =>
      RevocationEmail(props as unknown as Parameters<typeof RevocationEmail>[0]) as ReactElement,
    subject: subject('conformite.revocation'),
  });

  catalogue.set('conformite.erasure-confirmed', {
    component: (props) =>
      ErasureConfirmedEmail(
        props as unknown as Parameters<typeof ErasureConfirmedEmail>[0],
      ) as ReactElement,
    subject: subject('conformite.erasure-confirmed'),
  });

  return catalogue;
}
