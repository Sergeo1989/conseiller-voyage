// Identifiants UUID brandés des entités légales (spec 004).
// Empêche les confusions entre IDs (ex: passer un LegalAcceptanceId là où
// un LegalDocumentId est attendu) — le type strict TypeScript rejette
// l'erreur à la compilation.
// Cf. data-model.md *Value Objects*.

import { z } from 'zod';

const uuidSchema = z.string().uuid();

// --- Identifiants des tables légales ---

export const LegalDocumentIdSchema = uuidSchema.brand<'LegalDocumentId'>();
export type LegalDocumentId = z.infer<typeof LegalDocumentIdSchema>;

export const LegalAcceptanceIdSchema = uuidSchema.brand<'LegalAcceptanceId'>();
export type LegalAcceptanceId = z.infer<typeof LegalAcceptanceIdSchema>;

export const LegalAcceptanceAnonymizationIdSchema =
  uuidSchema.brand<'LegalAcceptanceAnonymizationId'>();
export type LegalAcceptanceAnonymizationId = z.infer<typeof LegalAcceptanceAnonymizationIdSchema>;

// --- Identifiants externes référencés par les acceptances ---
// Note : ces brand types sont redéfinis ici plutôt qu'importés de @cv/shared
// pour garder @cv/legal autonome (pas de dépendance circulaire). Les valeurs
// concrètes restent compatibles (même format UUID v4) — TypeScript vérifie
// au niveau brand uniquement, pas au runtime.

export const UserIdSchema = uuidSchema.brand<'UserId'>();
export type UserId = z.infer<typeof UserIdSchema>;

export const BriefIdSchema = uuidSchema.brand<'BriefId'>();
export type BriefId = z.infer<typeof BriefIdSchema>;
