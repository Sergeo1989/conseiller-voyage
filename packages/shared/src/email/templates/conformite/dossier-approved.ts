// T075 — Template email "Dossier approuvé".
//
// Signature ({ locale, ...props }) imposée par B3 du review itération 2
// (Principe IV) : i18n côté template, jamais de chaînes hardcodées.
//
// MVP : rendu HTML + plain text à la main, sans react-email. Le refactor
// vers @react-email/components viendra quand on aura plus que 2-3
// templates et qu'on voudra factoriser le squelette HTML (header, footer,
// boutons stylés).
//
// Le caller (BullMQ worker côté module identité, à venir) est
// responsable de :
//   1. Charger le catalogue i18n pour la locale du destinataire.
//   2. Appeler buildDossierApprovedEmail({ locale, ...props }).
//   3. Envoyer subject + html + text via AWS SES (ca-central-1).

import { formatDate } from '../../../conformite/formatters';

export interface DossierApprovedEmailProps {
  /** Locale du destinataire (fr-CA par défaut, en si configuré). */
  readonly locale: 'fr-CA' | 'en';
  /** Date de soumission du dossier (ISO ou Date). */
  readonly submittedAt: string | Date;
  /** Commentaire optionnel de l'admin (max 500 chars côté HTTP). */
  readonly comment?: string;
  /** URL absolue de base de l'app (ex: https://conseiller-voyage.ca). */
  readonly baseUrl: string;
}

/** Catalogue minimum strict — clés contractuelles avec fr-CA.json + en.json. */
interface EmailApprovedMessages {
  subject: string;
  greeting: string;
  body: string;
  bodyWithComment: string;
  ctaText: string;
  ctaUrl: string;
  footer: string;
}

/** Map FR-CA — miroir exact du fichier fr-CA.json (section email.approved). */
const FR_CA_APPROVED: EmailApprovedMessages = {
  subject: 'Votre dossier de conformité a été approuvé',
  greeting: 'Bonjour,',
  body: 'Votre dossier de conformité soumis le {submittedAt} a été approuvé par notre équipe.',
  bodyWithComment:
    "Votre dossier de conformité soumis le {submittedAt} a été approuvé par notre équipe. Commentaire de l'administrateur : {comment}",
  ctaText: 'Consulter mon espace conseiller',
  ctaUrl: '{baseUrl}/{locale}/conseiller/conformite',
  footer: 'Conseiller Voyage — toutes vos données sont hébergées au Canada (Loi 25).',
};

/** Map EN — miroir exact du fichier en.json (section email.approved). */
const EN_APPROVED: EmailApprovedMessages = {
  subject: 'Your compliance file has been approved',
  greeting: 'Hello,',
  body: 'Your compliance file submitted on {submittedAt} has been approved by our team.',
  bodyWithComment:
    'Your compliance file submitted on {submittedAt} has been approved by our team. Administrator comment: {comment}',
  ctaText: 'View my advisor dashboard',
  ctaUrl: '{baseUrl}/{locale}/conseiller/conformite',
  footer: 'Conseiller Voyage — all your data is hosted in Canada (Law 25).',
};

const CATALOGUES: Record<DossierApprovedEmailProps['locale'], EmailApprovedMessages> = {
  'fr-CA': FR_CA_APPROVED,
  en: EN_APPROVED,
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

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export function buildDossierApprovedEmail(props: DossierApprovedEmailProps): RenderedEmail {
  const messages = CATALOGUES[props.locale];
  const submittedDate = formatDate(
    typeof props.submittedAt === 'string' ? new Date(props.submittedAt) : props.submittedAt,
    props.locale,
  );

  const bodyTemplate = props.comment ? messages.bodyWithComment : messages.body;
  const bodyText = interpolate(bodyTemplate, {
    submittedAt: submittedDate,
    ...(props.comment !== undefined && { comment: props.comment }),
  });
  const ctaUrl = interpolate(messages.ctaUrl, {
    baseUrl: props.baseUrl,
    locale: props.locale,
  });

  const text = [
    messages.greeting,
    '',
    bodyText,
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
