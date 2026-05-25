// Schémas Zod partagés pour les payloads HTTP et internes des use cases
// du module identité (extension feature 004).
//
// Ces schémas sont consommés par :
//   - apps/api : validation côté serveur des bodies POST + DTOs use case
//   - apps/web : validation côté client des formulaires (signup, brief intake)
//   - tests : génération de fixtures
//
// Cf. specs/004-mentions-legales/contracts/http-endpoints.md et
// contracts/mdx-frontmatter.md.

import { z } from 'zod';
import { LegalDocumentTypeSchema } from './document-types';

// ---------------------------------------------------------------------
// HTTP: POST /api/me/legal/accept
// ---------------------------------------------------------------------

/**
 * Body de POST /api/me/legal/accept (US3 — conseiller au signup ou à la
 * ré-acceptation).
 *
 * Au MVP, seul `cgu_b2b` est acceptable via ce endpoint (le conseiller
 * accepte uniquement ses propres CGU). Les acceptations voyageur passent
 * par la façade interne `LegalAcceptanceFacade.acceptForBrief`.
 */
export const AcceptCguB2bBodySchema = z
  .object({
    documentType: z.literal('cgu_b2b'),
    documentVersion: z.number().int().positive(),
  })
  .strict();
export type AcceptCguB2bBody = z.infer<typeof AcceptCguB2bBodySchema>;

/**
 * Réponse 201/200 de POST /api/me/legal/accept.
 */
export const AcceptCguB2bResponseSchema = z.object({
  acceptanceId: z.string().uuid(),
  acceptedAt: z.string().datetime({ offset: false }),
  idempotent: z.boolean().optional(),
});
export type AcceptCguB2bResponse = z.infer<typeof AcceptCguB2bResponseSchema>;

// ---------------------------------------------------------------------
// HTTP: GET /api/me/legal/version-status
// ---------------------------------------------------------------------

export const LegalVersionStatusSchema = z.enum(['up_to_date', 'outdated', 'never_accepted']);
export type LegalVersionStatus = z.infer<typeof LegalVersionStatusSchema>;

export const VersionStatusResponseSchema = z.object({
  accepted: z.number().int().positive().nullable(),
  current: z.number().int().positive(),
  status: LegalVersionStatusSchema,
});
export type VersionStatusResponse = z.infer<typeof VersionStatusResponseSchema>;

// ---------------------------------------------------------------------
// Frontmatter des fichiers MDX (validé au build par tools/check-legal-mdx.ts)
// ---------------------------------------------------------------------

/**
 * Schéma du frontmatter YAML obligatoire dans chaque fichier
 * `packages/legal-content/<locale>/<slug>.mdx`.
 *
 * Cf. specs/004-mentions-legales/contracts/mdx-frontmatter.md.
 */
export const LegalMdxFrontmatterSchema = z
  .object({
    type: LegalDocumentTypeSchema,
    version: z.number().int().positive(),
    slug: z.string().regex(/^[a-z0-9-]+$/, 'slug must be URL-safe (a-z 0-9 -)'),
    title: z.string().min(1),
    description: z.string().min(1).max(160),
    publishedAt: z.string().datetime({ offset: false }),
    effectiveAt: z.string().datetime({ offset: false }),
    locale: z.string().min(2),
    changelog: z.string().optional(),
  })
  .strict()
  .refine((data) => new Date(data.effectiveAt) >= new Date(data.publishedAt), {
    message: 'effectiveAt must be >= publishedAt',
    path: ['effectiveAt'],
  });
export type LegalMdxFrontmatter = z.infer<typeof LegalMdxFrontmatterSchema>;

// ---------------------------------------------------------------------
// Façade publique consommée par 002-voyageur-intake (US4)
// ---------------------------------------------------------------------

export const AcceptForBriefInputSchema = z.object({
  briefId: z.string().uuid(),
  documentType: z.enum(['confidentialite', 'cgu_b2c']),
  documentVersion: z.number().int().positive(),
  acceptedAt: z.date(),
  ipAddress: z.string().min(1).max(45),
  userAgent: z.string().max(512),
});
export type AcceptForBriefInput = z.infer<typeof AcceptForBriefInputSchema>;

export const LegalAcceptanceRecordSchema = z.object({
  id: z.string().uuid(),
  briefId: z.string().uuid(),
  documentType: z.enum(['confidentialite', 'cgu_b2c']),
  documentVersion: z.number().int().positive(),
  acceptedAt: z.date(),
});
export type LegalAcceptanceRecord = z.infer<typeof LegalAcceptanceRecordSchema>;

// ---------------------------------------------------------------------
// Exceptions typées exposées par la façade (consommées par 002)
// ---------------------------------------------------------------------

export class UnknownLegalDocumentVersionError extends Error {
  constructor(
    public readonly documentType: string,
    public readonly documentVersion: number,
  ) {
    super(
      `Legal document (${documentType}, version=${documentVersion}) does not exist or is not yet effective.`,
    );
    this.name = 'UnknownLegalDocumentVersionError';
  }
}

export class LegalDocumentSupersededError extends Error {
  constructor(
    public readonly documentType: string,
    public readonly requestedVersion: number,
    public readonly currentVersion: number,
  ) {
    super(
      `Legal document (${documentType}) version ${requestedVersion} is superseded; current version is ${currentVersion}.`,
    );
    this.name = 'LegalDocumentSupersededError';
  }
}
