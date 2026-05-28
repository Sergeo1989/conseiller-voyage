// Port lecture de l'historique modérations admin d'un profil (feature 007).
//
// Consommé par LireProfilAdminUseCase pour afficher l'audit trail dans la
// console admin. La table profile_moderation_audits est append-only au
// niveau Postgres ; la lecture est triée par occurredAt DESC (plus récent
// d'abord).

import type { ProfilModerationAction } from '@cv/db';

export interface ProfilModerationAuditEntry {
  readonly id: string;
  readonly profileId: string;
  readonly adminAuthUserId: string;
  readonly adminEmailHash: string;
  readonly action: ProfilModerationAction;
  readonly raison: string;
  readonly metadonneesJson: unknown;
  readonly occurredAt: Date;
}

export interface ProfilModerationAuditReader {
  /**
   * Liste l'historique des modérations admin pour un profil donné, plus
   * récent en premier. Bornée à `limit` entrées (50 par défaut côté
   * adapter).
   */
  listByProfileId(
    profileId: string,
    limit?: number,
  ): Promise<readonly ProfilModerationAuditEntry[]>;
}

export const PROFIL_MODERATION_AUDIT_READER = Symbol.for('ProfilModerationAuditReader');
