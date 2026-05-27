// Schemas Zod partagés par apps/api (contrôleurs) et apps/web (Server
// Actions). Cf. specs/005-mfa-conseiller/contracts/http-endpoints.md
// § Schémas Zod partagés.

import { z } from 'zod';

/** Code TOTP à 6 chiffres saisi par l'utilisateur. */
export const TotpCodeSchema = z.string().regex(/^[0-9]{6}$/, 'Code TOTP invalide (6 chiffres)');

/**
 * Code de récupération au format XXXX-XXXX-XX (10 caractères significatifs
 * + 2 tirets). Alphabet sans confusion visuelle : exclut 0, O, 1, I, L.
 */
export const BackupCodeSchema = z
  .string()
  .regex(
    /^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{2}$/,
    'Code de récupération invalide (format XXXX-XXXX-XX, alphabet sans 0/O/1/I/L)',
  );

/**
 * Justification texte libre pour un reset MFA admin (FR-023). Minimum
 * 20 caractères pour forcer une justification substantielle, maximum
 * 1000 pour éviter les abus.
 */
export const JustificationSchema = z.string().min(20).max(1000);

/** UUID v4 (côté client ou serveur). */
export const UuidV4Schema = z.string().uuid();

/**
 * Énumération des actions sensibles qui exigent un step-up TOTP
 * (FR-017 conseiller + FR-018 admin). Le contrôleur de step-up reçoit
 * cette valeur pour traçabilité dans l'audit log (FR-031).
 */
export const IntendedActionSchema = z.enum([
  // Conseiller — FR-017
  'accept_lead',
  'reject_lead',
  'read_brief',
  'export_data',
  'modify_notif_settings',
  'delete_account',
  // Admin — FR-018
  'approve_dossier',
  'reject_dossier',
  'suspend_advisor',
  'revoke_advisor',
  'declare_license_withdrawal',
  'reset_advisor_mfa',
  'read_audit_log',
  // Cross-rôle — gestion MFA personnelle (FR-017 enrichi par P1-4)
  'regenerate_backup_codes',
  'manage_mfa_settings',
]);

export type IntendedAction = z.infer<typeof IntendedActionSchema>;
