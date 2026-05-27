// T022 — Tests TDD RED pour packages/mfa/src/schemas.ts.
// Schemas Zod partagés par apps/api (contrôleurs) et apps/web (Server
// Actions). Cf. contracts/http-endpoints.md § Schémas Zod partagés.

import { describe, expect, it } from 'vitest';
import {
  BackupCodeSchema,
  IntendedActionSchema,
  JustificationSchema,
  TotpCodeSchema,
  UuidV4Schema,
} from '../schemas';

describe('TotpCodeSchema', () => {
  it('accepte "123456"', () => {
    expect(TotpCodeSchema.safeParse('123456').success).toBe(true);
  });

  it('rejette "12345" (5 chiffres)', () => {
    expect(TotpCodeSchema.safeParse('12345').success).toBe(false);
  });

  it('rejette "1234567" (7 chiffres)', () => {
    expect(TotpCodeSchema.safeParse('1234567').success).toBe(false);
  });

  it('rejette "12345a" (alphanumérique)', () => {
    expect(TotpCodeSchema.safeParse('12345a').success).toBe(false);
  });
});

describe('BackupCodeSchema', () => {
  it('accepte "ABCD-EFGH-JK" (format XXXX-XXXX-XX)', () => {
    expect(BackupCodeSchema.safeParse('ABCD-EFGH-JK').success).toBe(true);
  });

  it('rejette "ABCDEFGHJK" (sans tirets)', () => {
    expect(BackupCodeSchema.safeParse('ABCDEFGHJK').success).toBe(false);
  });

  it('rejette "A0CD-EFGH-JK" (contient 0 — confusion avec O)', () => {
    expect(BackupCodeSchema.safeParse('A0CD-EFGH-JK').success).toBe(false);
  });

  it('rejette "AOCD-EFGH-JK" (contient O — confusion avec 0)', () => {
    expect(BackupCodeSchema.safeParse('AOCD-EFGH-JK').success).toBe(false);
  });

  it('rejette "A1CD-EFGH-JK" (contient 1)', () => {
    expect(BackupCodeSchema.safeParse('A1CD-EFGH-JK').success).toBe(false);
  });

  it('rejette "AICD-EFGH-JK" (contient I)', () => {
    expect(BackupCodeSchema.safeParse('AICD-EFGH-JK').success).toBe(false);
  });

  it('rejette "ALCD-EFGH-JK" (contient L)', () => {
    expect(BackupCodeSchema.safeParse('ALCD-EFGH-JK').success).toBe(false);
  });
});

describe('JustificationSchema', () => {
  it('accepte "X".repeat(20) — limite basse', () => {
    expect(JustificationSchema.safeParse('X'.repeat(20)).success).toBe(true);
  });

  it('rejette "X".repeat(19) — sous la limite', () => {
    expect(JustificationSchema.safeParse('X'.repeat(19)).success).toBe(false);
  });

  it('accepte "X".repeat(1000) — limite haute', () => {
    expect(JustificationSchema.safeParse('X'.repeat(1000)).success).toBe(true);
  });

  it('rejette "X".repeat(1001) — au-dessus de la limite', () => {
    expect(JustificationSchema.safeParse('X'.repeat(1001)).success).toBe(false);
  });
});

describe('UuidV4Schema', () => {
  it('accepte un UUID v4 valide', () => {
    expect(UuidV4Schema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
  });

  it('rejette "not-a-uuid"', () => {
    expect(UuidV4Schema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('IntendedActionSchema', () => {
  it('accepte "accept_lead"', () => {
    expect(IntendedActionSchema.safeParse('accept_lead').success).toBe(true);
  });

  it('accepte "approve_dossier"', () => {
    expect(IntendedActionSchema.safeParse('approve_dossier').success).toBe(true);
  });

  it('accepte "regenerate_backup_codes"', () => {
    expect(IntendedActionSchema.safeParse('regenerate_backup_codes').success).toBe(true);
  });

  it('rejette une action inconnue', () => {
    expect(IntendedActionSchema.safeParse('hack_database').success).toBe(false);
  });
});
