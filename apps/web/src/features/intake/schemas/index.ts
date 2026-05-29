// T060 — Ré-export des schémas Zod intake partagés (@cv/shared/intake)
// pour utilisation par react-hook-form + zodResolver côté Wizard.
// Pas de schéma supplémentaire côté Web — la validation est la même
// que côté API (Principe IX défense en profondeur).

export {
  type BriefStatus,
  BriefStatusSchema,
  type ConseillerLanguage,
  ConseillerLanguageSchema,
  ERASURE_ALL_PHRASE,
  ERASURE_BRIEF_PHRASE,
  ErasureRequestAllSchema,
  ErasureRequestBriefSchema,
  MAGIC_LINK_TOKEN_HEX_LENGTH,
  MAX_DESTINATIONS,
  ResendMagicLinkSchema,
  type SubmitBriefPayload,
  SubmitBriefSchema,
  type TravelBudget,
  TravelBudgetSchema,
  type TravelFamiliarity,
  TravelFamiliaritySchema,
  type TravelSpeciality,
  TravelSpecialitySchema,
  VerifyMagicLinkSchema,
} from '@cv/shared/intake';
