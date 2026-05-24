// T088 — Template email "Rappel d'expiration".
// Unifié J-60 / J-30 / J-7 via le param daysRemaining (selon B3 review
// itération 2 — signature ({ locale, ...props })).
// Cf. dossier-approved.ts pour les conventions de rendu.

import { formatDate } from '../../../conformite/formatters';
import type { RenderedEmail } from './dossier-approved';

export interface ExpirationReminderEmailProps {
  readonly locale: 'fr-CA' | 'en';
  readonly expiresAt: string | Date;
  /** Jours restants avant expiration (60, 30 ou 7). */
  readonly daysRemaining: 60 | 30 | 7;
  readonly baseUrl: string;
}

interface EmailReminderMessages {
  subjectByDays: Record<60 | 30 | 7, string>;
  greeting: string;
  bodyByDays: Record<60 | 30 | 7, string>;
  urgentBanner: string;
  ctaText: string;
  ctaUrl: string;
  footer: string;
}

const FR_CA: EmailReminderMessages = {
  subjectByDays: {
    60: 'Rappel : votre certificat expire dans 60 jours',
    30: 'Rappel : votre certificat expire dans 30 jours',
    7: 'URGENT : votre certificat expire dans 7 jours',
  },
  greeting: 'Bonjour,',
  bodyByDays: {
    60: 'Votre certificat de conformité expire le {expiresAt}, dans 60 jours. Vous pouvez dès maintenant soumettre votre renouvellement pour éviter toute interruption.',
    30: 'Votre certificat expire le {expiresAt}, dans 30 jours. Pensez à initier votre renouvellement dès que possible.',
    7: "ATTENTION : votre certificat expire le {expiresAt}, dans 7 jours seulement. Sans renouvellement, votre statut bascule automatiquement en suspendu à l'expiration.",
  },
  urgentBanner: 'Action requise sous 7 jours',
  ctaText: 'Soumettre mon renouvellement',
  ctaUrl: '{baseUrl}/{locale}/conseiller/conformite/renouveler',
  footer: 'Conseiller Voyage — toutes vos données sont hébergées au Canada (Loi 25).',
};

const EN: EmailReminderMessages = {
  subjectByDays: {
    60: 'Reminder: your certificate expires in 60 days',
    30: 'Reminder: your certificate expires in 30 days',
    7: 'URGENT: your certificate expires in 7 days',
  },
  greeting: 'Hello,',
  bodyByDays: {
    60: 'Your compliance certificate expires on {expiresAt}, in 60 days. You can submit your renewal now to avoid any interruption.',
    30: 'Your certificate expires on {expiresAt}, in 30 days. Please initiate your renewal as soon as possible.',
    7: 'ATTENTION: your certificate expires on {expiresAt}, in 7 days only. Without renewal, your status will automatically switch to suspended at expiration.',
  },
  urgentBanner: 'Action required within 7 days',
  ctaText: 'Submit my renewal',
  ctaUrl: '{baseUrl}/{locale}/conseiller/conformite/renouveler',
  footer: 'Conseiller Voyage — all your data is hosted in Canada (Law 25).',
};

const CATALOGUES: Record<ExpirationReminderEmailProps['locale'], EmailReminderMessages> = {
  'fr-CA': FR_CA,
  en: EN,
};

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildExpirationReminderEmail(props: ExpirationReminderEmailProps): RenderedEmail {
  const messages = CATALOGUES[props.locale];
  const expiresDate = formatDate(
    typeof props.expiresAt === 'string' ? new Date(props.expiresAt) : props.expiresAt,
    props.locale,
  );
  const subject = messages.subjectByDays[props.daysRemaining];
  const body = interpolate(messages.bodyByDays[props.daysRemaining], {
    expiresAt: expiresDate,
  });
  const ctaUrl = interpolate(messages.ctaUrl, {
    baseUrl: props.baseUrl,
    locale: props.locale,
  });

  const isUrgent = props.daysRemaining === 7;
  const accent = isUrgent ? '#dc2626' : '#2563eb';

  const text = [
    messages.greeting,
    '',
    body,
    '',
    `${messages.ctaText}: ${ctaUrl}`,
    '',
    `— ${messages.footer}`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(props.locale)}">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  ${isUrgent ? `<div style="background: ${accent}; color: #fff; padding: 8px 16px; border-radius: 4px; margin-bottom: 16px; font-weight: bold;">${escapeHtml(messages.urgentBanner)}</div>` : ''}
  <p>${escapeHtml(messages.greeting)}</p>
  <p>${escapeHtml(body)}</p>
  <p style="margin-top: 32px;">
    <a href="${escapeHtml(ctaUrl)}" style="background: ${accent}; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
      ${escapeHtml(messages.ctaText)}
    </a>
  </p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
  <p style="color: #6b7280; font-size: 12px;">${escapeHtml(messages.footer)}</p>
</body>
</html>`;

  return { subject, html, text };
}
