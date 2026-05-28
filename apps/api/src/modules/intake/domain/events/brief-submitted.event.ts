// T037 — Événement domaine `brief.submitted`.
// Émis après création initiale en statut pending_verification (T045).
// PAS publié dans l'outbox (le brief n'est pas encore vérifié — les
// consommateurs aval ne doivent pas voir un brief non confirmé).

import type {
  ConseillerLanguage,
  TravelBudget,
  TravelSpeciality,
  VoyageurBriefId,
  VoyageurContactId,
} from '@cv/shared/intake';

export interface BriefSubmittedEvent {
  readonly type: 'intake.brief.submitted';
  readonly briefId: VoyageurBriefId;
  readonly voyageurContactId: VoyageurContactId;
  readonly submittedAt: Date;
  readonly speciality: TravelSpeciality;
  readonly conseillerLanguage: ConseillerLanguage;
  readonly budgetRange: TravelBudget;
}
