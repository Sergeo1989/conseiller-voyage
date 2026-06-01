// Port VoyageurBriefWriter — mutations du domaine VoyageurBrief.
// Transactionnel : les méthodes qui touchent à des invariants outbox
// (activation, anonymisation) prennent une `Transaction` opaque qui sera
// dispatchée par l'adapter Prisma (T048 — Phase 3).

import type {
  BriefStatus,
  ConseillerLanguage,
  TravelBudget,
  TravelFamiliarity,
  TravelSpeciality,
  VoyageurBriefId,
  VoyageurContactId,
} from '@cv/shared/intake';

export interface CreateBriefInput {
  readonly id: VoyageurBriefId;
  readonly voyageurContactId: VoyageurContactId;
  readonly expiresAt: Date;
  readonly consentGivenAt: Date;
  readonly destinations: ReadonlyArray<{ country: string; region?: string }>;
  readonly departureDate: Date;
  readonly returnDate: Date;
  readonly datesFlexible: boolean;
  readonly datesFlexibilityDays: number | null;
  readonly adultsCount: number;
  readonly childrenAges: ReadonlyArray<number>;
  readonly infantsCount: number;
  readonly budgetRange: TravelBudget;
  readonly budgetNote: string | null;
  readonly conseillerLanguage: ConseillerLanguage;
  readonly conseillerLanguageOther: string | null;
  readonly speciality: TravelSpeciality;
  readonly specialityOther: string | null;
  readonly familiarity: TravelFamiliarity;
  readonly clientIp: string | null;
  readonly userAgent: string | null;
  readonly idempotencyKey: string | null;
  /**
   * Conseiller suggéré au moment de la soumission, validé HMAC depuis cookie
   * `cv_suggested` (feature 007). Null si cookie absent/invalide. Le matching
   * (011) applique un boost ≤ +10 % (FR-011) si conseiller éligible au calcul.
   */
  readonly suggestedConseillerId: string | null;
}

export interface VoyageurBriefWriter {
  /**
   * Crée un brief en statut `pending_verification`. Tout l'invariant
   * (insert brief + insert magic link + insert audit + insert outbox)
   * vit dans une transaction Prisma orchestrée par le use case (T045).
   */
  create(input: CreateBriefInput): Promise<void>;

  /**
   * Transition `pending_verification → active` lors de la consommation
   * du magic link (T047).
   */
  markVerified(args: {
    readonly briefId: VoyageurBriefId;
    readonly verifiedAt: Date;
  }): Promise<void>;

  /**
   * Transitions plus génériques pour expiration sweep (T131), erasure
   * (T105), admin push (T119).
   */
  updateStatus(args: {
    readonly briefId: VoyageurBriefId;
    readonly status: BriefStatus;
    readonly erasureRequestedAt?: Date;
    readonly anonymizedAt?: Date;
  }): Promise<void>;
}

export const VOYAGEUR_BRIEF_WRITER = Symbol.for('VoyageurBriefWriter');
