// T106a — Template email "Révocation de votre statut conseiller" (US4 FR-010).
// .tsx extension par convention du contrat T106a (react-email-ready),
// mais l'implémentation MVP reste HTML inline string-based.
//
// Signature ({ locale, reason, magicLink, baseUrl }) :
// - reason : motif communiqué par l'admin (≥ 20 chars)
// - magicLink : lien d'invitation pour re-soumettre un dossier
//   complet (US4 acceptance #2 — révocation peut être contestée
//   en re-soumettant)

import { formatDate } from '../../../conformite/formatters';
import type { RenderedEmail } from './dossier-approved';

export interface RevocationEmailProps {
  readonly locale: 'fr-CA' | 'en';
  readonly reason: string;
  readonly revokedAt: string | Date;
  readonly baseUrl: string;
  /** Magic link signé pour soumettre un nouveau dossier (optionnel). */
  readonly resubmitLink?: string;
}

interface EmailMessages {
  subject: string;
  greeting: string;
  body: string;
  reasonLabel: string;
  resubmitText: string;
  resubmitButton: string;
  footer: string;
}

const FR_CA: EmailMessages = {
  subject: 'Révocation de votre statut conseiller',
  greeting: 'Bonjour,',
  body: "Votre statut de conseiller vérifié sur Conseiller Voyage a été révoqué par un administrateur le {revokedAt}. À compter de cette date, votre profil n'est plus visible aux voyageurs et vous ne recevrez plus de demandes via la plateforme.",
  reasonLabel: "Motif communiqué par l'administrateur :",
  resubmitText:
    'Si vous souhaitez contester cette décision ou êtes en mesure de fournir de nouveaux documents conformes, vous pouvez soumettre un nouveau dossier complet :',
  resubmitButton: 'Soumettre un nouveau dossier',
  footer:
    'Conseiller Voyage — données hébergées au Canada (Loi 25). Pour toute question, contactez-nous à support@cv.example.ca.',
};

const EN: EmailMessages = {
  subject: 'Revocation of your advisor status',
  greeting: 'Hello,',
  body: 'Your verified advisor status on Conseiller Voyage was revoked by an administrator on {revokedAt}. From this date, your profile is no longer visible to travelers and you will no longer receive requests through the platform.',
  reasonLabel: 'Reason communicated by the administrator:',
  resubmitText:
    'If you wish to contest this decision or are able to provide new compliant documents, you can submit a new complete file:',
  resubmitButton: 'Submit a new file',
  footer:
    'Conseiller Voyage — data hosted in Canada (Law 25). For any question, contact us at support@cv.example.ca.',
};

const CATALOGUES: Record<RevocationEmailProps['locale'], EmailMessages> = {
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

export function buildRevocationEmail(props: RevocationEmailProps): RenderedEmail {
  const messages = CATALOGUES[props.locale];
  const revokedDate = formatDate(
    typeof props.revokedAt === 'string' ? new Date(props.revokedAt) : props.revokedAt,
    props.locale,
  );
  const body = interpolate(messages.body, { revokedAt: revokedDate });
  const resubmitUrl =
    props.resubmitLink ?? `${props.baseUrl}/${props.locale}/conseiller/conformite/soumettre`;

  const text = [
    messages.greeting,
    '',
    body,
    '',
    messages.reasonLabel,
    props.reason,
    '',
    messages.resubmitText,
    resubmitUrl,
    '',
    `— ${messages.footer}`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(props.locale)}">
<head><meta charset="utf-8"><title>${escapeHtml(messages.subject)}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
  <div style="background: #dc2626; color: #fff; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px; font-weight: bold;">
    ${escapeHtml(messages.subject)}
  </div>
  <p>${escapeHtml(messages.greeting)}</p>
  <p>${escapeHtml(body)}</p>
  <p><strong>${escapeHtml(messages.reasonLabel)}</strong></p>
  <blockquote style="border-left: 4px solid #dc2626; margin: 8px 0; padding: 8px 16px; background: #fef2f2; color: #7f1d1d;">
    ${escapeHtml(props.reason)}
  </blockquote>
  <p style="margin-top: 24px;">${escapeHtml(messages.resubmitText)}</p>
  <p style="margin-top: 16px;">
    <a href="${escapeHtml(resubmitUrl)}" style="background: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
      ${escapeHtml(messages.resubmitButton)}
    </a>
  </p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
  <p style="color: #6b7280; font-size: 12px;">${escapeHtml(messages.footer)}</p>
</body>
</html>`;

  return { subject: messages.subject, html, text };
}
