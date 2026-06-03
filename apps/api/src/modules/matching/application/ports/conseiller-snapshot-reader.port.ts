// T021 — Port ConseillerSnapshotReader (lecture domain pour scoring).
//
// L'adapter Prisma (T059 Phase 3) assemble :
//   - filtre verified via ConformiteQueryPort (cross-module 001)
//   - filtre dur langue (Q3 clarify) — exclu si languages ne contient pas
//     la langue demandée par le voyageur
//   - hiérarchie adresse profil 007 → siège conformite 001 (R5 / ADR-0024)
//   - mapping anneesExperience (int) → experienceTier (mentor/pair/pair_expert)
//   - mapping zonesGeographiques.code → destinations.country (proxy MVP)
//
// Snapshot 100 % immutable consommé par la fonction pure scoring (Principe VI).

import type { FsaCode } from '@cv/shared/matching';

export type ConseillerLanguage = 'fr' | 'en';
export type ConseillerExperienceTier = 'pair_junior' | 'pair' | 'mentor';

export interface ConseillerSnapshotDestination {
  readonly country: string; // ISO-3166-1 alpha-2 (ex. "CU", "IT") OU proxy
  readonly regions?: ReadonlyArray<string>;
}

export interface ConseillerSnapshot {
  readonly conseillerId: string; // brand côté consommateur (ConseillerId)
  readonly languages: ReadonlyArray<ConseillerLanguage>;
  readonly specialities: ReadonlyArray<string>; // enum TravelSpeciality aligné 008
  readonly destinations: ReadonlyArray<ConseillerSnapshotDestination>;
  readonly experienceTier: ConseillerExperienceTier;
  readonly fsa: FsaCode | null; // null si codePostal absent ou invalide
}

export interface ConseillerSnapshotReader {
  /**
   * Lit tous les conseillers `verified` (via ConformiteQueryPort) qui parlent
   * `filterLanguage` (filtre dur Q3 — exclu si la langue n'est pas dans
   * `profile.languages`).
   *
   * Retourne un snapshot immutable consommable par la fonction pure scoring.
   * Les conseillers sans FSA (codePostal manquant ou invalide) sont inclus
   * dans le résultat avec `fsa = null` ; la fonction pure les marque comme
   * `matching.conseiller_address_missing` (FR-009c) et les exclut du top 3.
   */
  readAllVerifiedSnapshots(
    filterLanguage: ConseillerLanguage,
  ): Promise<ReadonlyArray<ConseillerSnapshot>>;
}

export const CONSEILLER_SNAPSHOT_READER = Symbol.for('ConseillerSnapshotReader');
