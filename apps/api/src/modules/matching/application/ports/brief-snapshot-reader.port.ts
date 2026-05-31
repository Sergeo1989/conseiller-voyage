// T022 — Port BriefSnapshotReader (lecture brief activé pour scoring).
//
// L'adapter Prisma (T058 Phase 3) lit `intake_voyageur_briefs` joint à
// `intake_voyageur_contacts`, extrait le FSA depuis `contact.postalCode`
// via `parseFsaFromPostalCode`, et résout `suggestedConseillerId` depuis
// le champ du brief (capturé au moment de la soumission 008 si cookie
// cv_suggested HMAC valide).
//
// Snapshot immutable consommé par PerformMatchingUseCase.

import type { FsaCode } from '@cv/shared/matching';
import type { ConseillerLanguage } from './conseiller-snapshot-reader.port';

export type TravelSpeciality =
  | 'croisiere'
  | 'aventure_outdoor'
  | 'lune_de_miel'
  | 'famille_avec_enfants'
  | 'mobilite_reduite'
  | 'multigenerationnel'
  | 'culturel_historique'
  | 'luxe'
  | 'road_trip'
  | 'voyage_affaires'
  | 'autre';

export type TravelFamiliarity = 'first_big_trip' | 'occasional_traveler' | 'experienced_traveler';

export interface BriefSnapshotDestination {
  readonly country: string; // ISO-3166-1 alpha-2 (ex. "CU")
  readonly region?: string; // libre, ex. "La Havane"
}

export interface BriefSnapshot {
  readonly briefId: string; // brand VoyageurBriefId côté consommateur
  readonly destinations: ReadonlyArray<BriefSnapshotDestination>;
  readonly conseillerLanguage: ConseillerLanguage; // filtre dur Q3
  readonly speciality: TravelSpeciality;
  readonly familiarity: TravelFamiliarity;
  readonly voyageurFsa: FsaCode | null; // null si postalCode invalide / hors CA
  readonly suggestedConseillerId: string | null; // depuis cookie cv_suggested (007)
}

export interface BriefSnapshotReader {
  /**
   * Lit le brief activé pour scoring. Retourne null si :
   *   - le briefId est inconnu
   *   - le brief est en `pending_verification` (jamais matché)
   *   - le brief est anonymisé Loi 25 (FR-022/FR-022a)
   */
  readByBriefId(briefId: string): Promise<BriefSnapshot | null>;
}

export const BRIEF_SNAPSHOT_READER = Symbol.for('BriefSnapshotReader');
