// T027 — Port FsaCentroidReader (table de lookup centroïdes FSA).
//
// L'adapter `EmbeddedFsaCentroidReader` (T060 Phase 3) charge le fichier
// statique `@cv/shared/matching/fsa-centroids.json` au boot du module
// (singleton DI), valide la structure Zod, expose la lookup O(1).
//
// Pas d'I/O au moment du calcul scoring — la table est en mémoire.

import type { FsaCode } from '@cv/shared/matching';

export type ProvinceCode =
  | 'QC'
  | 'ON'
  | 'BC'
  | 'AB'
  | 'MB'
  | 'SK'
  | 'NS'
  | 'NB'
  | 'NL'
  | 'PE'
  | 'YT'
  | 'NT'
  | 'NU';

export interface FsaCentroid {
  readonly lat: number;
  readonly lng: number;
  readonly province: ProvinceCode;
}

export type FsaCentroidTable = ReadonlyMap<FsaCode, FsaCentroid>;

export interface FsaCentroidReader {
  /**
   * Lookup centroïde par FSA — retourne null si FSA inconnu (cas du
   * bootstrap fixture qui ne couvre que 41 FSA métros, ou si le fichier
   * StatCan est encore incomplet).
   */
  lookup(fsaCode: FsaCode): FsaCentroid | null;

  /**
   * Retourne la table complète chargée au boot (utile pour les tests qui
   * doivent injecter une table partielle).
   */
  getAll(): FsaCentroidTable;
}

export const FSA_CENTROID_READER = Symbol.for('FsaCentroidReader');
