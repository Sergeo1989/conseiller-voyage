// T017 [TDD RED] — Tests des identifiants UUID brandés du module intake.
// Pattern hérité de packages/shared/src/conformite/branded-ids.ts (001).
//
// État TDD : RED — l'import depuis `../branded-ids` ÉCHOUE en compilation
// tant que T018 n'est pas livré (le fichier branded-ids.ts n'existe pas).
// Une fois T018 implémenté, ces tests passent au GREEN.

import { describe, expect, it } from 'vitest';
import {
  MagicLinkTokenIdSchema,
  VoyageurBriefIdSchema,
  VoyageurContactIdSchema,
  asMagicLinkTokenId,
  asVoyageurBriefId,
  asVoyageurContactId,
} from '../branded-ids';

const VALID_UUID_V4 = '550e8400-e29b-41d4-a716-446655440000';
const ANOTHER_VALID_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('VoyageurBriefIdSchema', () => {
  it('accepte un UUID v4 valide', () => {
    const parsed = VoyageurBriefIdSchema.parse(VALID_UUID_V4);
    expect(parsed).toBe(VALID_UUID_V4);
  });

  it('refuse une string non-UUID', () => {
    expect(() => VoyageurBriefIdSchema.parse('pas-un-uuid')).toThrow();
  });

  it('refuse une string vide', () => {
    expect(() => VoyageurBriefIdSchema.parse('')).toThrow();
  });

  it('refuse un nombre', () => {
    expect(() => VoyageurBriefIdSchema.parse(42 as unknown as string)).toThrow();
  });

  it('refuse null', () => {
    expect(() => VoyageurBriefIdSchema.parse(null as unknown as string)).toThrow();
  });
});

describe('MagicLinkTokenIdSchema', () => {
  it('accepte un UUID v4 valide', () => {
    const parsed = MagicLinkTokenIdSchema.parse(ANOTHER_VALID_UUID);
    expect(parsed).toBe(ANOTHER_VALID_UUID);
  });

  it('refuse une string non-UUID', () => {
    expect(() => MagicLinkTokenIdSchema.parse('abc')).toThrow();
  });

  it('le brand TypeScript distingue MagicLinkTokenId de VoyageurBriefId', () => {
    // Test de fumée : la même valeur UUID parsée par 2 schémas produit
    // 2 types distincts au compile-time. À l'exécution, seules les valeurs
    // sont comparables — le brand est effacé.
    const briefId = VoyageurBriefIdSchema.parse(VALID_UUID_V4);
    const tokenId = MagicLinkTokenIdSchema.parse(VALID_UUID_V4);
    expect(briefId).toBe(tokenId); // valeurs égales en runtime
    // Mais le compilateur refuse `const x: MagicLinkTokenId = briefId;`
    // (vérification typecheck séparée, ce test ne couvre que le runtime).
  });
});

describe('VoyageurContactIdSchema', () => {
  it('accepte un UUID v4 valide', () => {
    const parsed = VoyageurContactIdSchema.parse(VALID_UUID_V4);
    expect(parsed).toBe(VALID_UUID_V4);
  });

  it('refuse une string non-UUID', () => {
    expect(() => VoyageurContactIdSchema.parse('contact-1')).toThrow();
  });
});

describe('Helpers as*Id', () => {
  it('asVoyageurBriefId est équivalent à VoyageurBriefIdSchema.parse', () => {
    expect(asVoyageurBriefId(VALID_UUID_V4)).toBe(VALID_UUID_V4);
  });

  it('asMagicLinkTokenId est équivalent à MagicLinkTokenIdSchema.parse', () => {
    expect(asMagicLinkTokenId(ANOTHER_VALID_UUID)).toBe(ANOTHER_VALID_UUID);
  });

  it('asVoyageurContactId est équivalent à VoyageurContactIdSchema.parse', () => {
    expect(asVoyageurContactId(VALID_UUID_V4)).toBe(VALID_UUID_V4);
  });

  it('asVoyageurBriefId lance ZodError sur invalide', () => {
    expect(() => asVoyageurBriefId('not-uuid')).toThrow();
  });
});
