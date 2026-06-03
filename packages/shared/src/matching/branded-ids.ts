// T016 — Branded IDs du module matching (feature 011).
//
// Pattern aligné avec `@cv/shared/intake/branded-ids` : on utilise
// uniquement `z.brand<'X'>()` (le brand Zod sert aussi de brand
// TypeScript). Pas de double brand custom symbol + Zod (conflit de types).

import { z } from 'zod';

const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// IDs UUID v4 du module matching
// ---------------------------------------------------------------------------

export const MatchingResultIdSchema = uuidSchema.brand<'MatchingResultId'>();
export type MatchingResultId = z.infer<typeof MatchingResultIdSchema>;

export const MatchingResultEntryIdSchema = uuidSchema.brand<'MatchingResultEntryId'>();
export type MatchingResultEntryId = z.infer<typeof MatchingResultEntryIdSchema>;

export const MatchingAuditEntryIdSchema = uuidSchema.brand<'MatchingAuditEntryId'>();
export type MatchingAuditEntryId = z.infer<typeof MatchingAuditEntryIdSchema>;

export const MatchingOutboxEntryIdSchema = uuidSchema.brand<'MatchingOutboxEntryId'>();
export type MatchingOutboxEntryId = z.infer<typeof MatchingOutboxEntryIdSchema>;

// ---------------------------------------------------------------------------
// FsaCode — 3 caractères majuscule, format `^[A-Z]\d[A-Z]$` (ex. H7N, M5V)
// ---------------------------------------------------------------------------

export const FSA_REGEX = /^[A-Z]\d[A-Z]$/;

export const FsaCodeSchema = z
  .string()
  .regex(FSA_REGEX, 'FSA must be 3 characters: letter + digit + letter (uppercase)')
  .brand<'FsaCode'>();

export type FsaCode = z.infer<typeof FsaCodeSchema>;

// ---------------------------------------------------------------------------
// Helpers — construction depuis littéraux (tests, seeds, parsing API)
// ---------------------------------------------------------------------------

export function asMatchingResultId(uuid: string): MatchingResultId {
  return MatchingResultIdSchema.parse(uuid);
}

export function asMatchingResultEntryId(uuid: string): MatchingResultEntryId {
  return MatchingResultEntryIdSchema.parse(uuid);
}

export function asMatchingAuditEntryId(uuid: string): MatchingAuditEntryId {
  return MatchingAuditEntryIdSchema.parse(uuid);
}

export function asMatchingOutboxEntryId(uuid: string): MatchingOutboxEntryId {
  return MatchingOutboxEntryIdSchema.parse(uuid);
}

export function asFsaCode(value: string): FsaCode {
  return FsaCodeSchema.parse(value);
}

/**
 * Extrait le FSA depuis un code postal canadien complet.
 * Accepte les formats : `A1A 1A1`, `A1A1A1`, `a1a 1a1`, etc.
 * Retourne null si le code postal est invalide.
 */
export function parseFsaFromPostalCode(postalCode: string | null | undefined): FsaCode | null {
  if (!postalCode) return null;
  const cleaned = postalCode.replace(/\s+/g, '').toUpperCase();
  const candidate = cleaned.slice(0, 3);
  if (!FSA_REGEX.test(candidate)) return null;
  return candidate as FsaCode;
}
