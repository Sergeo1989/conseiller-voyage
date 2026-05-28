// T032 — Port writer audit modération admin profil (feature 007, FR-023).
//
// Écrit dans la table profile_moderation_audits (append-only via trigger
// Postgres). Complémentaire à auth_audit_events qui reste la source
// transverse — la table dédiée capture les actions spécifiques profil
// (retrait photo, masquage, rétablissement) avec leur raison FR-023.
//
// Pattern hérité de mfa-audit-writer (002a) + auth-audit-writer (002).

import type { Prisma, ProfilModerationAction } from '@cv/db';

export interface AppendProfilModerationAuditInput {
  readonly profileId: string;
  readonly adminAuthUserId: string;
  /** Email normalisé de l'admin — hashé SHA-256 par l'adapter. */
  readonly adminEmail: string;
  readonly action: ProfilModerationAction;
  readonly raison: string;
  readonly metadonneesJson?: Prisma.JsonObject;
}

export interface ProfilModerationAuditWriter {
  append(input: AppendProfilModerationAuditInput, tx?: Prisma.TransactionClient): Promise<void>;
}

export const PROFIL_MODERATION_AUDIT_WRITER = Symbol.for('ProfilModerationAuditWriter');
