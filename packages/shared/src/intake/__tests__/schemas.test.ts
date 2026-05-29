// T019 [TDD RED] — Tests Zod des 6 schémas API du module intake.
// Couvre les 6 endpoints publics + admin documentés dans
// contracts/http-endpoints.md (§1 + §2).
//
// État TDD : RED — l'import depuis `../schemas` ÉCHOUE en compilation
// tant que T020 n'est pas livré.
//
// Couverture minimale (Principe VI) :
//   - ≥ 5 cas valides par schéma
//   - ≥ 8 cas refus par schéma (path d'erreur asserté)
//   - cas spécifiques aux clarifications Q1-Q5 (résumé spec.md §Clarifications)

import { describe, expect, it } from 'vitest';
import {
  AdminPushManualSchema,
  ErasureRequestAllSchema,
  ErasureRequestBriefSchema,
  ResendMagicLinkSchema,
  SubmitBriefSchema,
  VerifyMagicLinkSchema,
} from '../schemas';

// ---------------------------------------------------------------------
// SubmitBriefSchema — POST /api/intake/briefs (FR-001 à FR-011)
// ---------------------------------------------------------------------

const VALID_SUBMIT_BRIEF = {
  destinations: [{ country: 'IT', region: 'Toscane' }],
  departureDate: '2027-03-15',
  returnDate: '2027-03-30',
  datesFlexible: true,
  datesFlexibilityDays: 5,
  adultsCount: 2,
  childrenAges: [8, 12],
  infantsCount: 0,
  budgetRange: 'between_5k_10k',
  budgetNote: 'Préférence pour hôtels avec piscine',
  conseillerLanguage: 'fr',
  speciality: 'lune_de_miel',
  familiarity: 'experienced_traveler',
  contact: {
    email: 'marie.dupont@gmail.com',
    firstName: 'Marie',
    lastName: 'Dupont',
    phone: '514-555-1234',
    postalCode: 'H7N 1A1',
  },
  consentGiven: true,
};

describe('SubmitBriefSchema — cas valides', () => {
  it('accepte un brief complet', () => {
    expect(() => SubmitBriefSchema.parse(VALID_SUBMIT_BRIEF)).not.toThrow();
  });

  it('accepte budget sans budgetNote (optionnel)', () => {
    const { budgetNote: _bn, ...rest } = VALID_SUBMIT_BRIEF;
    expect(() => SubmitBriefSchema.parse(rest)).not.toThrow();
  });

  it('accepte sans phone (optionnel)', () => {
    const data = {
      ...VALID_SUBMIT_BRIEF,
      contact: { ...VALID_SUBMIT_BRIEF.contact, phone: undefined },
    };
    expect(() => SubmitBriefSchema.parse(data)).not.toThrow();
  });

  it('accepte conseillerLanguage=other avec languageOther ISO 639-1', () => {
    const data = {
      ...VALID_SUBMIT_BRIEF,
      conseillerLanguage: 'other' as const,
      conseillerLanguageOther: 'pt',
    };
    expect(() => SubmitBriefSchema.parse(data)).not.toThrow();
  });

  it('accepte speciality=autre avec specialityOther', () => {
    const data = {
      ...VALID_SUBMIT_BRIEF,
      speciality: 'autre' as const,
      specialityOther: 'voyage gastronomique en Italie',
    };
    expect(() => SubmitBriefSchema.parse(data)).not.toThrow();
  });

  it('accepte datesFlexible=false sans datesFlexibilityDays', () => {
    const data = {
      ...VALID_SUBMIT_BRIEF,
      datesFlexible: false,
      datesFlexibilityDays: undefined,
    };
    expect(() => SubmitBriefSchema.parse(data)).not.toThrow();
  });
});

describe('SubmitBriefSchema — cas refus', () => {
  it('refuse email mal formé', () => {
    const data = {
      ...VALID_SUBMIT_BRIEF,
      contact: { ...VALID_SUBMIT_BRIEF.contact, email: 'pas-un-email' },
    };
    const result = SubmitBriefSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'contact.email')).toBe(true);
    }
  });

  it('refuse adultsCount = 0 (FR-004 ≥ 1)', () => {
    const data = { ...VALID_SUBMIT_BRIEF, adultsCount: 0 };
    const result = SubmitBriefSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'adultsCount')).toBe(true);
    }
  });

  it('refuse returnDate avant departureDate', () => {
    const data = { ...VALID_SUBMIT_BRIEF, returnDate: '2027-03-01' };
    const result = SubmitBriefSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('refuse datesFlexibilityDays = 0 si datesFlexible=true (1-30)', () => {
    const data = { ...VALID_SUBMIT_BRIEF, datesFlexibilityDays: 0 };
    const result = SubmitBriefSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('refuse datesFlexibilityDays > 30', () => {
    const data = { ...VALID_SUBMIT_BRIEF, datesFlexibilityDays: 45 };
    const result = SubmitBriefSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('refuse consentGiven=false (FR-010 case obligatoire)', () => {
    const data = { ...VALID_SUBMIT_BRIEF, consentGiven: false };
    const result = SubmitBriefSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'consentGiven')).toBe(true);
    }
  });

  it('refuse budget hors enum', () => {
    const data = { ...VALID_SUBMIT_BRIEF, budgetRange: 'between_100k_200k' };
    const result = SubmitBriefSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('refuse destinations vide (au moins 1 requise)', () => {
    const data = { ...VALID_SUBMIT_BRIEF, destinations: [] };
    const result = SubmitBriefSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('refuse postalCode mal formé', () => {
    const data = {
      ...VALID_SUBMIT_BRIEF,
      contact: { ...VALID_SUBMIT_BRIEF.contact, postalCode: '12345' },
    };
    const result = SubmitBriefSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('refuse speciality=autre sans specialityOther (FR-007)', () => {
    const data = {
      ...VALID_SUBMIT_BRIEF,
      speciality: 'autre' as const,
      specialityOther: undefined,
    };
    const result = SubmitBriefSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------
// VerifyMagicLinkSchema — POST /api/intake/briefs/verify
// ---------------------------------------------------------------------

describe('VerifyMagicLinkSchema', () => {
  it('accepte un token hex 64 chars', () => {
    const token = 'a'.repeat(64);
    expect(() => VerifyMagicLinkSchema.parse({ token })).not.toThrow();
  });

  it('refuse un token trop court', () => {
    expect(VerifyMagicLinkSchema.safeParse({ token: 'abc' }).success).toBe(false);
  });

  it('refuse un token absent', () => {
    expect(VerifyMagicLinkSchema.safeParse({}).success).toBe(false);
  });

  it('refuse un token contenant des caractères non-hex', () => {
    const token = 'g'.repeat(64);
    expect(VerifyMagicLinkSchema.safeParse({ token }).success).toBe(false);
  });

  it('refuse un nombre comme token', () => {
    expect(VerifyMagicLinkSchema.safeParse({ token: 42 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------
// ResendMagicLinkSchema — POST /api/intake/briefs/:id/resend-magic-link
// ---------------------------------------------------------------------

describe('ResendMagicLinkSchema', () => {
  it('accepte un email valide', () => {
    expect(() => ResendMagicLinkSchema.parse({ email: 'a@b.ca' })).not.toThrow();
  });

  it('refuse un email mal formé', () => {
    expect(ResendMagicLinkSchema.safeParse({ email: 'pas-email' }).success).toBe(false);
  });

  it('refuse un email vide', () => {
    expect(ResendMagicLinkSchema.safeParse({ email: '' }).success).toBe(false);
  });

  it('refuse un email > 254 chars (RFC 5321)', () => {
    const longEmail = `${'a'.repeat(250)}@b.ca`;
    expect(ResendMagicLinkSchema.safeParse({ email: longEmail }).success).toBe(false);
  });

  it('refuse un champ email absent', () => {
    expect(ResendMagicLinkSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------
// ErasureRequestBriefSchema — POST /api/intake/briefs/:id/erasure-request
// ---------------------------------------------------------------------

describe('ErasureRequestBriefSchema (FR-022 brief seul)', () => {
  const VALID = { confirmation: 'JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE' };

  it('accepte la phrase exacte', () => {
    expect(() => ErasureRequestBriefSchema.parse(VALID)).not.toThrow();
  });

  it('refuse la phrase pour erase-all (Q4 — phrases distinctes)', () => {
    const data = { confirmation: 'JE_CONFIRME_LA_SUPPRESSION_DE_TOUTES_MES_DONNEES' };
    expect(ErasureRequestBriefSchema.safeParse(data).success).toBe(false);
  });

  it('refuse une phrase approchante', () => {
    expect(
      ErasureRequestBriefSchema.safeParse({ confirmation: 'JE_CONFIRME_LA_SUPPRESSION' }).success,
    ).toBe(false);
  });

  it('refuse en lower-case', () => {
    expect(
      ErasureRequestBriefSchema.safeParse({
        confirmation: 'je_confirme_la_suppression_irreversible',
      }).success,
    ).toBe(false);
  });

  it('refuse vide', () => {
    expect(ErasureRequestBriefSchema.safeParse({ confirmation: '' }).success).toBe(false);
  });

  it('refuse champ absent', () => {
    expect(ErasureRequestBriefSchema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------
// ErasureRequestAllSchema — POST /api/intake/voyageur/erase-all-data (FR-022a, C1)
// ---------------------------------------------------------------------

describe('ErasureRequestAllSchema (FR-022a global)', () => {
  const VALID = {
    confirmation: 'JE_CONFIRME_LA_SUPPRESSION_DE_TOUTES_MES_DONNEES',
    acknowledgedBriefCount: 3,
  };

  it('accepte la phrase + count entier ≥ 1', () => {
    expect(() => ErasureRequestAllSchema.parse(VALID)).not.toThrow();
  });

  it('accepte acknowledgedBriefCount=1 (au moins 1 brief)', () => {
    expect(() =>
      ErasureRequestAllSchema.parse({ ...VALID, acknowledgedBriefCount: 1 }),
    ).not.toThrow();
  });

  it('refuse la phrase pour erase-brief (Q4 distincte)', () => {
    const data = { ...VALID, confirmation: 'JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE' };
    expect(ErasureRequestAllSchema.safeParse(data).success).toBe(false);
  });

  it('refuse acknowledgedBriefCount=0 (≥ 1 requis)', () => {
    expect(ErasureRequestAllSchema.safeParse({ ...VALID, acknowledgedBriefCount: 0 }).success).toBe(
      false,
    );
  });

  it('refuse acknowledgedBriefCount négatif', () => {
    expect(
      ErasureRequestAllSchema.safeParse({ ...VALID, acknowledgedBriefCount: -1 }).success,
    ).toBe(false);
  });

  it('refuse acknowledgedBriefCount non-entier', () => {
    expect(
      ErasureRequestAllSchema.safeParse({ ...VALID, acknowledgedBriefCount: 2.5 }).success,
    ).toBe(false);
  });

  it('refuse champ confirmation absent', () => {
    expect(ErasureRequestAllSchema.safeParse({ acknowledgedBriefCount: 3 }).success).toBe(false);
  });

  it('refuse champ acknowledgedBriefCount absent', () => {
    expect(ErasureRequestAllSchema.safeParse({ confirmation: VALID.confirmation }).success).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------
// AdminPushManualSchema — POST /api/intake/admin/briefs/:id/push-manual (US5)
// ---------------------------------------------------------------------

describe('AdminPushManualSchema', () => {
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const VALID_REASON =
    'Conseiller spécialisé en croisière Méditerranée parlant italien identifié par téléphone';

  it('accepte un payload valide', () => {
    expect(() =>
      AdminPushManualSchema.parse({
        conseillerComplianceId: VALID_UUID,
        reason: VALID_REASON,
      }),
    ).not.toThrow();
  });

  it('refuse un conseillerComplianceId non-UUID', () => {
    expect(
      AdminPushManualSchema.safeParse({
        conseillerComplianceId: 'pas-uuid',
        reason: VALID_REASON,
      }).success,
    ).toBe(false);
  });

  it('refuse un motif < 20 chars (FR-028)', () => {
    expect(
      AdminPushManualSchema.safeParse({
        conseillerComplianceId: VALID_UUID,
        reason: 'court',
      }).success,
    ).toBe(false);
  });

  it('refuse un motif > 500 chars', () => {
    expect(
      AdminPushManualSchema.safeParse({
        conseillerComplianceId: VALID_UUID,
        reason: 'x'.repeat(501),
      }).success,
    ).toBe(false);
  });

  it('refuse un motif vide', () => {
    expect(
      AdminPushManualSchema.safeParse({
        conseillerComplianceId: VALID_UUID,
        reason: '',
      }).success,
    ).toBe(false);
  });

  it('refuse conseillerComplianceId absent', () => {
    expect(AdminPushManualSchema.safeParse({ reason: VALID_REASON }).success).toBe(false);
  });

  it('refuse reason absent', () => {
    expect(AdminPushManualSchema.safeParse({ conseillerComplianceId: VALID_UUID }).success).toBe(
      false,
    );
  });

  it('refuse motif exactement à 19 chars (boundary FR-028)', () => {
    expect(
      AdminPushManualSchema.safeParse({
        conseillerComplianceId: VALID_UUID,
        reason: 'x'.repeat(19),
      }).success,
    ).toBe(false);
  });
});
