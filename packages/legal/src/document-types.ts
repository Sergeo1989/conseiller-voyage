// Enum des types de documents légaux, partagé entre apps/web (rendu des
// pages MDX) et apps/api (use cases d'acceptation et d'anonymisation).
//
// L'ordre des valeurs est non-significatif. La valeur doit matcher
// exactement les valeurs de l'enum Prisma `LegalDocumentType` (cf.
// packages/db/prisma/schema/legal.prisma).

import { z } from 'zod';

export const LEGAL_DOCUMENT_TYPES = [
  'mentions_legales',
  'cgu_b2c',
  'cgu_b2b',
  'confidentialite',
  'comment_ca_marche',
] as const;

export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export const LegalDocumentTypeSchema = z.enum(LEGAL_DOCUMENT_TYPES);

/**
 * Sous-ensemble des types qui matérialisent un consentement explicite
 * (collecté côté UI, persisté en `auth_legal_acceptances`).
 *
 * `mentions_legales` et `comment_ca_marche` sont versionnés pour
 * traçabilité éditoriale mais ne collectent pas d'acceptation
 * utilisateur.
 */
export const CONSENT_BEARING_DOCUMENT_TYPES = ['cgu_b2c', 'cgu_b2b', 'confidentialite'] as const;

export type ConsentBearingDocumentType = (typeof CONSENT_BEARING_DOCUMENT_TYPES)[number];

export const ConsentBearingDocumentTypeSchema = z.enum(CONSENT_BEARING_DOCUMENT_TYPES);

export function isConsentBearingType(type: LegalDocumentType): type is ConsentBearingDocumentType {
  return (CONSENT_BEARING_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Type de sujet qui accepte un document.
 *
 * - `user` : conseiller ou admin authentifié (subjectId = `auth_users.id`)
 * - `brief` : voyageur anonyme (subjectId = `briefs.id`)
 */
export const LEGAL_ACCEPTANCE_SUBJECT_TYPES = ['user', 'brief'] as const;
export type LegalAcceptanceSubjectType = (typeof LEGAL_ACCEPTANCE_SUBJECT_TYPES)[number];
export const LegalAcceptanceSubjectTypeSchema = z.enum(LEGAL_ACCEPTANCE_SUBJECT_TYPES);
