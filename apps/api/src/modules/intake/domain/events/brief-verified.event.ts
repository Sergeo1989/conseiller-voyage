// T037 — Événement domaine `brief.verified`.
// Émis quand le magic link est consommé (T047). Déclenche la publication
// outbox `voyageur.brief.activated` (consommé par matching 011).

import type {
  ConseillerLanguage,
  TravelBudget,
  TravelSpeciality,
  VoyageurBriefId,
  VoyageurContactId,
} from '@cv/shared/intake';

export interface BriefVerifiedEvent {
  readonly type: 'intake.brief.verified';
  readonly briefId: VoyageurBriefId;
  readonly voyageurContactId: VoyageurContactId;
  readonly verifiedAt: Date;
  readonly speciality: TravelSpeciality;
  readonly conseillerLanguage: ConseillerLanguage;
  readonly budgetRange: TravelBudget;
}
