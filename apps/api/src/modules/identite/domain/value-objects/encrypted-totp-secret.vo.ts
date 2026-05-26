// Branded type pour le ciphertext sérialisé d'un secret TOTP.
// Cf. ADR-0010 (format AES-256-GCM + version + iv + tag, base64).
//
// Re-export du brand défini dans @cv/mfa pour cohérence cross-package.

export type { EncryptedTotpSecret } from '@cv/mfa';
