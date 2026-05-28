// T020 [TDD GREEN] — Schémas Zod API du module intake.
// Partagés entre apps/api (validation NestJS via ZodValidationPipe) et
// apps/web (Server Actions + react-hook-form resolver).
//
// Source de vérité : contracts/http-endpoints.md §1 (public voyageur)
// + §2 (admin) + §3 (Server Actions).
//
// Cf. tests T019 dans __tests__/schemas.test.ts.

import { z } from 'zod';

// =====================================================================
// Constantes partagées (FR + tableaux canoniques)
// =====================================================================

/** Max destinations multi-stop (L1 deferred — pragmatique). */
export const MAX_DESTINATIONS = 10;

/** FR-004 — bornes raisonnables, alignées sur composition groupe réaliste. */
export const MAX_ADULTS_COUNT = 20;
export const MAX_CHILDREN_COUNT = 12;
export const MIN_CHILD_AGE = 3;
export const MAX_CHILD_AGE = 17;
export const MAX_INFANTS_COUNT = 4;

/** FR-005 budget — note optionnelle. */
export const MAX_BUDGET_NOTE_CHARS = 500;
/** FR-007 spécialité autre — précision libre. */
export const MAX_SPECIALITY_OTHER_CHARS = 200;
/** FR-009 — bornes PII. */
export const MAX_EMAIL_CHARS = 254; // RFC 5321
export const MAX_NAME_CHARS = 100;
export const MAX_PHONE_CHARS = 20;
/** FR-028 — motif admin push manuel. */
export const MIN_ADMIN_REASON_CHARS = 20;
export const MAX_ADMIN_REASON_CHARS = 500;
/** FR-013 — magic link random token (32 bytes hex). */
export const MAGIC_LINK_TOKEN_HEX_LENGTH = 64;

/** Phrases exactes Loi 25 (Q4 clarify — distinctes pour les 2 flows). */
export const ERASURE_BRIEF_PHRASE = 'JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE' as const;
export const ERASURE_ALL_PHRASE = 'JE_CONFIRME_LA_SUPPRESSION_DE_TOUTES_MES_DONNEES' as const;

/** Format code postal canadien (FR-009). */
const CA_POSTAL_CODE_REGEX = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/;
/** Code ISO 639-1 (2 lettres minuscules). */
const ISO_639_1_REGEX = /^[a-z]{2}$/;
/** Hex string (token). */
const HEX_REGEX = /^[0-9a-f]+$/;

// =====================================================================
// Enums (alignés sur Prisma intake.prisma T011)
// =====================================================================

export const TravelBudgetSchema = z.enum([
  'under_2k',
  'between_2k_5k',
  'between_5k_10k',
  'between_10k_20k',
  'above_20k',
]);
export type TravelBudget = z.infer<typeof TravelBudgetSchema>;

export const TravelSpecialitySchema = z.enum([
  'croisiere',
  'aventure_outdoor',
  'lune_de_miel',
  'famille_avec_enfants',
  'mobilite_reduite',
  'multigenerationnel',
  'culturel_historique',
  'luxe',
  'road_trip',
  'voyage_affaires',
  'autre',
]);
export type TravelSpeciality = z.infer<typeof TravelSpecialitySchema>;

export const TravelFamiliaritySchema = z.enum([
  'first_big_trip',
  'occasional_traveler',
  'experienced_traveler',
]);
export type TravelFamiliarity = z.infer<typeof TravelFamiliaritySchema>;

export const ConseillerLanguageSchema = z.enum(['fr', 'en', 'es', 'other']);
export type ConseillerLanguage = z.infer<typeof ConseillerLanguageSchema>;

export const BriefStatusSchema = z.enum([
  'pending_verification',
  'active',
  'matched',
  'expired_unverified',
  'expired',
  'deleted',
  'anonymized',
]);
export type BriefStatus = z.infer<typeof BriefStatusSchema>;

// =====================================================================
// SubmitBriefSchema — POST /api/intake/briefs (FR-001 à FR-011)
// =====================================================================

const DestinationSchema = z.object({
  country: z.string().min(2).max(100),
  region: z.string().max(100).optional(),
});

const SubmitContactSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_CHARS).toLowerCase(),
  firstName: z.string().min(1).max(MAX_NAME_CHARS),
  lastName: z.string().min(1).max(MAX_NAME_CHARS),
  phone: z.string().max(MAX_PHONE_CHARS).optional(),
  postalCode: z.string().regex(CA_POSTAL_CODE_REGEX).optional(),
});

export const SubmitBriefSchema = z
  .object({
    destinations: z.array(DestinationSchema).min(1).max(MAX_DESTINATIONS),
    departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    datesFlexible: z.boolean(),
    datesFlexibilityDays: z.number().int().min(1).max(30).optional(),
    adultsCount: z.number().int().min(1).max(MAX_ADULTS_COUNT),
    childrenAges: z
      .array(z.number().int().min(MIN_CHILD_AGE).max(MAX_CHILD_AGE))
      .max(MAX_CHILDREN_COUNT)
      .default([]),
    infantsCount: z.number().int().min(0).max(MAX_INFANTS_COUNT).default(0),
    budgetRange: TravelBudgetSchema,
    budgetNote: z.string().max(MAX_BUDGET_NOTE_CHARS).optional(),
    conseillerLanguage: ConseillerLanguageSchema,
    conseillerLanguageOther: z.string().regex(ISO_639_1_REGEX).optional(),
    speciality: TravelSpecialitySchema,
    specialityOther: z.string().min(1).max(MAX_SPECIALITY_OTHER_CHARS).optional(),
    familiarity: TravelFamiliaritySchema,
    contact: SubmitContactSchema,
    consentGiven: z.literal(true), // FR-010 case obligatoire
  })
  .superRefine((data, ctx) => {
    // returnDate > departureDate (data-model.md `returnDate > departureDate`)
    if (data.returnDate <= data.departureDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['returnDate'],
        message: 'La date de retour doit être après la date de départ.',
      });
    }

    // datesFlexible=true → datesFlexibilityDays requis
    if (data.datesFlexible && data.datesFlexibilityDays === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['datesFlexibilityDays'],
        message: 'Précisez l’amplitude de flexibilité (1-30 jours).',
      });
    }

    // speciality='autre' → specialityOther requis (FR-007)
    if (data.speciality === 'autre' && !data.specialityOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['specialityOther'],
        message: 'Précisez la spécialité de voyage souhaitée.',
      });
    }

    // conseillerLanguage='other' → conseillerLanguageOther requis (R8)
    if (data.conseillerLanguage === 'other' && !data.conseillerLanguageOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conseillerLanguageOther'],
        message: 'Indiquez le code ISO 639-1 de la langue souhaitée.',
      });
    }

    // childrenAges.length doit être cohérent (informatif — pas une regression
    // FR mais documenté ici car la spec ne contraint pas explicitement).
  });

export type SubmitBriefPayload = z.infer<typeof SubmitBriefSchema>;

// =====================================================================
// VerifyMagicLinkSchema — POST /api/intake/briefs/verify
// =====================================================================

export const VerifyMagicLinkSchema = z.object({
  token: z.string().length(MAGIC_LINK_TOKEN_HEX_LENGTH).regex(HEX_REGEX),
});
export type VerifyMagicLinkPayload = z.infer<typeof VerifyMagicLinkSchema>;

// =====================================================================
// ResendMagicLinkSchema — POST /api/intake/briefs/:id/resend-magic-link
// =====================================================================

export const ResendMagicLinkSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_CHARS).toLowerCase(),
});
export type ResendMagicLinkPayload = z.infer<typeof ResendMagicLinkSchema>;

// =====================================================================
// ErasureRequestBriefSchema — POST /api/intake/briefs/:id/erasure-request
// =====================================================================

export const ErasureRequestBriefSchema = z.object({
  confirmation: z.literal(ERASURE_BRIEF_PHRASE),
});
export type ErasureRequestBriefPayload = z.infer<typeof ErasureRequestBriefSchema>;

// =====================================================================
// ErasureRequestAllSchema — POST /api/intake/voyageur/erase-all-data (FR-022a, C1)
// =====================================================================

export const ErasureRequestAllSchema = z.object({
  confirmation: z.literal(ERASURE_ALL_PHRASE),
  acknowledgedBriefCount: z.number().int().min(1),
});
export type ErasureRequestAllPayload = z.infer<typeof ErasureRequestAllSchema>;

// =====================================================================
// AdminPushManualSchema — POST /api/intake/admin/briefs/:id/push-manual
// =====================================================================

export const AdminPushManualSchema = z.object({
  conseillerComplianceId: z.string().uuid(),
  reason: z.string().min(MIN_ADMIN_REASON_CHARS).max(MAX_ADMIN_REASON_CHARS),
});
export type AdminPushManualPayload = z.infer<typeof AdminPushManualSchema>;
