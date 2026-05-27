// Port LegalAcceptanceReader (T031) — lecture des acceptations
// légales avec gestion transparente de l'anonymisation Loi 25.
// Cf. specs/004-mentions-legales/data-model.md *Sémantique de lecture*.

import type { LegalDocumentType } from '@cv/legal';
import type { LegalAcceptanceWithAnonymization } from '../../domain/entities/legal-acceptance-anonymization.entity';
import type { LegalAcceptance } from '../../domain/entities/legal-acceptance.entity';

export interface LegalAcceptanceReader {
  /**
   * Récupère la dernière acceptation d'un user/brief pour un type de
   * document donné. Retourne `null` si jamais accepté.
   *
   * **Attention** : retourne la row brute SANS anonymisation appliquée.
   * À utiliser uniquement quand `subjectId` est nécessaire en clair
   * (typiquement vérification idempotence avant un nouvel INSERT). Pour
   * lecture publique / audit, préférer `findWithAnonymization`.
   */
  findLatestBySubject(input: {
    subjectId: string;
    documentType: LegalDocumentType;
  }): Promise<LegalAcceptance | null>;

  /**
   * Récupère une acceptation par ID avec son éventuelle anonymisation
   * jointe (LEFT JOIN sur auth_legal_acceptance_anonymizations).
   *
   * **Méthode recommandée** pour toute lecture en dehors du contexte
   * d'idempotence d'écriture. Garantit que le consommateur reçoit les
   * valeurs masquées si la row a été anonymisée Loi 25.
   */
  findWithAnonymization(acceptanceId: string): Promise<LegalAcceptanceWithAnonymization | null>;

  /**
   * Liste toutes les acceptations d'un user (par exemple lors d'un
   * effacement Loi 25 cross-module). Retourne avec anonymisation jointe.
   */
  listBySubject(subjectId: string): Promise<ReadonlyArray<LegalAcceptanceWithAnonymization>>;
}

export const LEGAL_ACCEPTANCE_READER = Symbol.for('LegalAcceptanceReader');
