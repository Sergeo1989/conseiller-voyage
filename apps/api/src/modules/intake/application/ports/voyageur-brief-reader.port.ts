// Port VoyageurBriefReader — lectures du domaine VoyageurBrief.
// Interface Segregation (Principe VIII) : séparé de VoyageurBriefWriter.
//
// Les méthodes retournent des entités domaine (T034 — Phase 3) ; pour
// l'instant Phase 2 utilise des shapes minimales DTO basées sur le
// data-model.md. Une fois VoyageurBrief entity créée, ce DTO sera
// remplacé par l'import depuis `../../domain/entities/voyageur-brief.entity`.

import type {
  BriefStatus,
  ConseillerLanguage,
  TravelBudget,
  TravelFamiliarity,
  TravelSpeciality,
  VoyageurBriefId,
  VoyageurContactId,
} from '@cv/shared/intake';

export interface VoyageurBriefRecord {
  readonly id: VoyageurBriefId;
  readonly voyageurContactId: VoyageurContactId;
  readonly status: BriefStatus;
  readonly submittedAt: Date;
  readonly verifiedAt: Date | null;
  readonly expiresAt: Date;
  readonly consentGivenAt: Date;
  readonly erasureRequestedAt: Date | null;
  readonly anonymizedAt: Date | null;
  readonly abuseMarkedAt: Date | null;
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
  readonly idempotencyKey: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VoyageurBriefReader {
  findById(id: VoyageurBriefId): Promise<VoyageurBriefRecord | null>;
  findByIdempotencyKey(key: string): Promise<VoyageurBriefRecord | null>;
  listActiveByContactId(contactId: VoyageurContactId): Promise<ReadonlyArray<VoyageurBriefRecord>>;
  /**
   * Trouve le dernier brief en `pending_verification` du contact, pour le
   * resend-magic-link (T081c, N1). Renvoie null s'il n'y en a pas — la
   * Server Action retourne quand même `sent_or_email_not_found` uniforme
   * (anti-énumération).
   */
  findLatestPendingByContactId(contactId: VoyageurContactId): Promise<VoyageurBriefRecord | null>;
  /**
   * Briefs actifs depuis > hoursThreshold heures sans match (FR-026).
   * `nowMs` permet la testabilité avec FakeClock.
   */
  listUnmatchedSince(args: {
    readonly hoursThreshold: number;
    readonly nowMs: number;
    readonly page: number;
    readonly pageSize: number;
  }): Promise<{
    readonly items: ReadonlyArray<VoyageurBriefRecord>;
    readonly total: number;
  }>;
}

export const VOYAGEUR_BRIEF_READER = Symbol.for('VoyageurBriefReader');
