// Port LegalDocumentRepository (T030) — lecture/écriture des documents
// légaux versionnés.
// Cf. specs/004-mentions-legales/contracts/legal-acceptance.port.md.

import type { LegalDocumentId, LegalDocumentType } from '@cv/legal';
import type { LegalDocument } from '../../domain/entities/legal-document.entity';

export interface LegalDocumentRepository {
  /**
   * Lookup par ID. Retourne `null` si non trouvé.
   */
  findById(id: LegalDocumentId): Promise<LegalDocument | null>;

  /**
   * Lookup par couple (type, version). Retourne `null` si non trouvé.
   */
  findByTypeAndVersion(type: LegalDocumentType, version: number): Promise<LegalDocument | null>;

  /**
   * Récupère la version active courante d'un type donné.
   *
   * Sémantique : `max(version) WHERE type = X AND effectiveAt <= now()`.
   * Retourne `null` si aucune version n'est encore effective.
   */
  findCurrentByType(type: LegalDocumentType, asOf: Date): Promise<LegalDocument | null>;

  /**
   * Liste toutes les versions effectives d'un type donné, du plus récent
   * au plus ancien. Utile pour reporting/dashboard.
   */
  listEffectiveByType(type: LegalDocumentType, asOf: Date): Promise<ReadonlyArray<LegalDocument>>;

  /**
   * Insert une nouvelle version (post-seed). Idempotent sur
   * `(type, version)` — no-op si la row existe déjà avec checksum
   * identique, exception si checksum différent.
   *
   * Appelé par le script `tools/seed-legal-documents.ts` au déploiement.
   */
  insertVersion(input: {
    type: LegalDocumentType;
    version: number;
    checksum: string;
    contentSnapshot: string;
    publishedAt: Date;
    effectiveAt: Date;
  }): Promise<LegalDocument>;
}

export const LEGAL_DOCUMENT_REPOSITORY = Symbol.for('LegalDocumentRepository');
