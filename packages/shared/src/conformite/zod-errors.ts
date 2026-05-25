// T030f — Map d'erreurs Zod en FR-CA (Principe IV).
// À appliquer globalement via z.setErrorMap() au boot de chaque app.
// Structure prête à recevoir une map EN ultérieure (sélection par locale).

import { type ZodErrorMap, type ZodIssueOptionalMessage, z } from 'zod';

function formatInvalidType(
  issue: Extract<ZodIssueOptionalMessage, { code: 'invalid_type' }>,
): string {
  if (issue.received === 'undefined' || issue.received === 'null') {
    return 'Ce champ est obligatoire.';
  }
  return `Type invalide : attendu ${issue.expected}, reçu ${issue.received}.`;
}

function formatTooSmall(issue: Extract<ZodIssueOptionalMessage, { code: 'too_small' }>): string {
  if (issue.type === 'string') return `Doit contenir au moins ${issue.minimum} caractère(s).`;
  if (issue.type === 'array') return `Au moins ${issue.minimum} élément(s) requis.`;
  return `Valeur trop petite : minimum ${issue.minimum}.`;
}

function formatTooBig(issue: Extract<ZodIssueOptionalMessage, { code: 'too_big' }>): string {
  if (issue.type === 'string') return `Doit contenir au maximum ${issue.maximum} caractère(s).`;
  if (issue.type === 'array') return `Au maximum ${issue.maximum} élément(s) autorisé(s).`;
  return `Valeur trop grande : maximum ${issue.maximum}.`;
}

function formatInvalidString(
  issue: Extract<ZodIssueOptionalMessage, { code: 'invalid_string' }>,
): string {
  const validation = issue.validation;
  if (validation === 'email') return 'Adresse courriel invalide.';
  if (validation === 'url') return 'URL invalide.';
  if (validation === 'uuid') return 'Identifiant invalide.';
  if (typeof validation === 'object' && 'startsWith' in validation) {
    return `Doit commencer par « ${validation.startsWith} ».`;
  }
  return 'Format invalide.';
}

function frCAMessage(issue: ZodIssueOptionalMessage, defaultMessage: string): string {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return formatInvalidType(issue);
    case z.ZodIssueCode.too_small:
      return formatTooSmall(issue);
    case z.ZodIssueCode.too_big:
      return formatTooBig(issue);
    case z.ZodIssueCode.invalid_string:
      return formatInvalidString(issue);
    case z.ZodIssueCode.invalid_enum_value:
      return `Valeur invalide. Valeurs acceptées : ${issue.options.join(', ')}.`;
    case z.ZodIssueCode.invalid_date:
      return 'Date invalide.';
    case z.ZodIssueCode.custom:
      return issue.message ?? 'Valeur invalide.';
    default:
      return defaultMessage;
  }
}

export const frCAErrorMap: ZodErrorMap = (issue, ctx) => ({
  message: frCAMessage(issue, ctx.defaultError),
});

/** À appeler une seule fois au boot de chaque app (apps/api, apps/web). */
export function applyFrCAZodErrorMap(): void {
  z.setErrorMap(frCAErrorMap);
}
