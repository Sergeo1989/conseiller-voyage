// Entité LegalDocument (T026) — document légal versionné, immutable
// post-publication.
// Cf. specs/004-mentions-legales/data-model.md *LegalDocument*.

import type { LegalDocumentId, LegalDocumentType } from '@cv/legal';

export interface LegalDocument {
  readonly id: LegalDocumentId;
  readonly type: LegalDocumentType;
  readonly version: number;
  /** SHA-256 hex (64 chars) du corps MDX rendu (hors frontmatter) */
  readonly checksum: string;
  /**
   * Snapshot complet du contenu rendu à publication. Archive éternelle —
   * permet de réafficher une version acceptée historiquement même si le
   * fichier MDX dans le repo a évolué.
   */
  readonly contentSnapshot: string;
  readonly publishedAt: Date;
  /** Date de prise d'effet (≥ publishedAt) à partir de laquelle la version devient obligatoire */
  readonly effectiveAt: Date;
}
