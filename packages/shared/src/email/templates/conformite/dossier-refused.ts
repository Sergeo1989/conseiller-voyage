// T075 — Template email "Dossier refusé".
// Cf. dossier-approved.ts pour les conventions (signature locale,
// catalogue inline miroir des JSON, escapeHtml, etc.).

import { formatDate } from '../../../conformite/formatters';
import type { RenderedEmail } from './dossier-approved';

export interface DossierRefusedEmailProps {
  readonly locale: 'fr-CA' | 'en';
  readonly submittedAt: string | Date;
  /** Motif communiqué par l'admin (≥ 20 chars FR-004). */
  readonly reason: string;
  readonly baseUrl: string;
}

interface EmailRefusedMessages {
  subject: string;
  greeting: string;
  body: string;
  reasonLabel: string;
  ctaText: string;
  ctaUrl: string;
  footer: string;
}

const FR_CA_REFUSED: EmailRefusedMessages = {
  subject: 'Votre dossier de conformité requiert des corrections',
  greeting: 'Bonjour,',
  body: "Votre dossier de conformité soumis le {submittedAt} ne peut être validé en l'état.",
  reasonLabel: "Motif communiqué par l'administrateur :",
  ctaText: 'Soumettre un dossier corrigé',
  ctaUrl: '{baseUrl}/{locale}/conseiller/conformite/soumettre',
  footer: 'Conseiller Voyage — toutes vos données sont hébergées au Canada (Loi 25).',
};

const EN_REFUSED: EmailRefusedMessages = {
  subject: 'Your compliance file requires corrections',
  greeting: 'Hello,',
  body: 'Your compliance file submitted on {submittedAt} cannot be validated as-is.',
  reasonLabel: 'Reason from the administrator:',
  ctaText: 'Submit a corrected file',
  ctaUrl: '{baseUrl}/{locale}/conseiller/conformite/soumettre',
  footer: 'Conseiller Voyage — all your data is hosted in Canada (Law 25).',
};

const CATALOGUES: Record<DossierRefusedEmailProps['locale'], EmailRefusedMessages> = {
  'fr-CA': FR_CA_REFUSED,
  en: EN_REFUSED,
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

export function buildDossierRefusedEmail(props: DossierRefusedEmailProps): RenderedEmail {
  const messages = CATALOGUES[props.locale];
  const submittedDate = formatDate(
    typeof props.submittedAt === 'string' ? new Date(props.submittedAt) : props.submittedAt,
    props.locale,
  );
  const bodyText = interpolate(messages.body, { submittedAt: submittedDate });
  const ctaUrl = interpolate(messages.ctaUrl, {
    baseUrl: props.baseUrl,
    locale: props.locale,
  });

  const text = [
    messages.greeting,
    '',
    bodyText,
    '',
    messages.reasonLabel,
    props.reason,
    '',
    `${messages.ctaText}: ${ctaUrl}`,
    '',
    `— ${messages.footer}`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(props.locale)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(messages.subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <p>${escapeHtml(messages.greeting)}</p>
  <p>${escapeHtml(bodyText)}</p>
  <p style="margin-top: 16px;"><strong>${escapeHtml(messages.reasonLabel)}</strong></p>
  <blockquote style="border-left: 4px solid #ef4444; margin: 8px 0; padding: 8px 16px; background: #fef2f2; color: #7f1d1d;">
    ${escapeHtml(props.reason)}
  </blockquote>
  <p style="margin-top: 32px;">
    <a href="${escapeHtml(ctaUrl)}" style="background: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
      ${escapeHtml(messages.ctaText)}
    </a>
  </p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
  <p style="color: #6b7280; font-size: 12px;">${escapeHtml(messages.footer)}</p>
</body>
</html>`;

  return {
    subject: messages.subject,
    html,
    text,
  };
}
