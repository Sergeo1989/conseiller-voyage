// T034 — Entité racine VoyageurBrief.
// Immuable post-vérification email (anti-manipulation scoring matching).
// Cf. data-model.md *Entity: VoyageurBrief* + transitions.

import type {
  BriefStatus,
  ConseillerLanguage,
  TravelBudget,
  TravelFamiliarity,
  TravelSpeciality,
  VoyageurBriefId,
  VoyageurContactId,
} from '@cv/shared/intake';

export interface VoyageurBrief {
  readonly id: VoyageurBriefId;
  readonly voyageurContactId: VoyageurContactId;
  readonly status: BriefStatus;
  readonly submittedAt: Date;
  readonly verifiedAt: Date | null;
  readonly expiresAt: Date;
  readonly consentGivenAt: Date;
  readonly erasureRequestedAt: Date | null;
  readonly anonymizedAt: Date | null;
  readonly destinations: ReadonlyArray<{ readonly country: string; readonly region?: string }>;
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
}

// =====================================================================
// Helpers de transition d'état (purs, retournent une nouvelle entité)
// =====================================================================

/**
 * Transition pending_verification → active (clic magic link, T047).
 * Lance Error si le brief n'est pas dans le bon statut d'origine.
 */
export function markVerified(brief: VoyageurBrief, verifiedAt: Date): VoyageurBrief {
  if (brief.status !== 'pending_verification') {
    throw new Error(
      `markVerified : statut invalide (${brief.status}), attendu pending_verification.`,
    );
  }
  return { ...brief, status: 'active', verifiedAt };
}

/**
 * Transition `active|matched → expired` (sweep J+90, T131).
 */
export function markExpired(brief: VoyageurBrief): VoyageurBrief {
  if (brief.status !== 'active' && brief.status !== 'matched') {
    throw new Error(`markExpired : statut invalide (${brief.status}).`);
  }
  return { ...brief, status: 'expired' };
}

/**
 * Transition vers `deleted` après demande effacement Loi 25 (T105).
 * Le statut `deleted` est non-terminal côté DB — l'anonymisation viendra
 * en suite via le job BullMQ. La transition terminale `anonymized` est
 * gérée par le trigger SQL T015 + le markAnonymized ci-bas.
 */
export function markDeleted(brief: VoyageurBrief, erasureRequestedAt: Date): VoyageurBrief {
  if (brief.status === 'anonymized') {
    throw new Error('markDeleted : brief déjà anonymisé.');
  }
  return { ...brief, status: 'deleted', erasureRequestedAt };
}

/**
 * Transition terminale vers `anonymized` (job worker, T105/T115c). PII
 * du contact est nullifiée par VoyageurContact.applyAnonymisation().
 */
export function markAnonymized(brief: VoyageurBrief, anonymizedAt: Date): VoyageurBrief {
  if (brief.status === 'anonymized') {
    return brief; // idempotent
  }
  return { ...brief, status: 'anonymized', anonymizedAt };
}

/** Vrai si la J+expirationDays est dépassée — pour le sweep T131. */
export function isExpired(brief: VoyageurBrief, now: Date): boolean {
  return now >= brief.expiresAt;
}
