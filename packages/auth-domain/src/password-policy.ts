// T022 — validatePasswordPolicy (FR-003).
//
// Politique :
//   - 12..128 caractères
//   - ≥ 1 minuscule, ≥ 1 majuscule, ≥ 1 chiffre, ≥ 1 symbole
//   - Refus si contient l'email ou le prénom (insensible à la casse)
//
// Fonction pure. Aucun I/O.

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// Prénom de moins de 4 caractères ignoré pour ne pas matcher accidentellement
// dans des mots de passe longs ("Al" risquerait de faire échouer trop de cas).
const MIN_FIRSTNAME_CHECK_LENGTH = 4;

export type PasswordPolicyError =
  | 'PASSWORD_TOO_SHORT'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_MISSING_LOWERCASE'
  | 'PASSWORD_MISSING_UPPERCASE'
  | 'PASSWORD_MISSING_DIGIT'
  | 'PASSWORD_MISSING_SYMBOL'
  | 'PASSWORD_CONTAINS_EMAIL'
  | 'PASSWORD_CONTAINS_FIRSTNAME';

export type PasswordPolicyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly PasswordPolicyError[] };

interface CharacterClassRule {
  readonly pattern: RegExp;
  readonly error: PasswordPolicyError;
}

const CHARACTER_CLASS_RULES: ReadonlyArray<CharacterClassRule> = [
  { pattern: /[a-z]/, error: 'PASSWORD_MISSING_LOWERCASE' },
  { pattern: /[A-Z]/, error: 'PASSWORD_MISSING_UPPERCASE' },
  { pattern: /[0-9]/, error: 'PASSWORD_MISSING_DIGIT' },
  // Symbole : tout caractère non alphanumérique.
  { pattern: /[^A-Za-z0-9]/, error: 'PASSWORD_MISSING_SYMBOL' },
];

function checkLength(password: string, errors: PasswordPolicyError[]): void {
  if (password.length < PASSWORD_MIN_LENGTH) errors.push('PASSWORD_TOO_SHORT');
  if (password.length > PASSWORD_MAX_LENGTH) errors.push('PASSWORD_TOO_LONG');
}

function checkCharacterClasses(password: string, errors: PasswordPolicyError[]): void {
  for (const rule of CHARACTER_CLASS_RULES) {
    if (!rule.pattern.test(password)) errors.push(rule.error);
  }
}

function checkContextualContent(
  password: string,
  email: string | undefined,
  firstName: string | undefined,
  errors: PasswordPolicyError[],
): void {
  const lowerPassword = password.toLowerCase();
  if (email && email.length > 0 && lowerPassword.includes(email.toLowerCase())) {
    errors.push('PASSWORD_CONTAINS_EMAIL');
  }
  if (
    firstName &&
    firstName.length >= MIN_FIRSTNAME_CHECK_LENGTH &&
    lowerPassword.includes(firstName.toLowerCase())
  ) {
    errors.push('PASSWORD_CONTAINS_FIRSTNAME');
  }
}

/**
 * Valide un mot de passe contre la politique de complexité (FR-003).
 * `email` et `firstName` sont optionnels mais recommandés pour des
 * validations contextuelles supplémentaires.
 */
export function validatePasswordPolicy(
  password: string,
  email?: string,
  firstName?: string,
): PasswordPolicyResult {
  const errors: PasswordPolicyError[] = [];
  checkLength(password, errors);
  checkCharacterClasses(password, errors);
  checkContextualContent(password, email, firstName, errors);

  if (errors.length === 0) return { ok: true };
  return { ok: false, errors };
}
