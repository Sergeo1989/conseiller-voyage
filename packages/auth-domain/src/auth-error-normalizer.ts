// T025 — normalizeAuthError (R5 anti-énumération).
//
// Masque toutes les raisons internes d'échec login (USER_NOT_FOUND,
// INVALID_PASSWORD, ACCOUNT_DISABLED, EMAIL_NOT_VERIFIED) sous un seul
// code générique exposé au caller : INVALID_CREDENTIALS.
//
// Le caller (use case / controller) peut choisir de surcharger cette
// normalisation pour certains contextes (e.g., rediriger vers
// /verifier-email si EMAIL_NOT_VERIFIED) — mais le code retourné en
// réponse HTTP reste uniforme.

export type AuthErrorReason =
  | 'USER_NOT_FOUND'
  | 'INVALID_PASSWORD'
  | 'ACCOUNT_DISABLED'
  | 'EMAIL_NOT_VERIFIED';

export type NormalizedAuthError = 'INVALID_CREDENTIALS';

export function normalizeAuthError(_reason: AuthErrorReason): NormalizedAuthError {
  return 'INVALID_CREDENTIALS';
}
