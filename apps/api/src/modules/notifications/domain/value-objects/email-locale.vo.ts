// T031 — Value Object EmailLocale.

export type EmailLocale = 'fr-CA' | 'en';

export const ALLOWED_LOCALES: ReadonlyArray<EmailLocale> = ['fr-CA', 'en'];

export function isValidLocale(value: string): value is EmailLocale {
  return ALLOWED_LOCALES.includes(value as EmailLocale);
}

export function parseLocaleOrDefault(value: string | null | undefined): EmailLocale {
  if (value && isValidLocale(value)) return value;
  return 'fr-CA';
}
