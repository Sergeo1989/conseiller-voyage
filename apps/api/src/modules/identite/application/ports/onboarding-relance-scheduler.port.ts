// T031 — Port scheduler BullMQ des relances onboarding (feature 007, FR-021 / R8).
//
// 3 jobs delayed (J+3, J+7, J+14) par conseiller post-vérification.
// jobId déterministe `onboarding-reminder-<profileId>-<etape>` pour
// idempotence. Annulation à l'atteinte du statut 'pret'.
//
// Cf. table profile_onboarding_reminder_schedules (data-model.md).

import type { OnboardingRelanceEtape } from '@cv/db';

export interface PlanifierRelancesInput {
  readonly profileId: string;
  readonly verifiedAt: Date;
}

export interface OnboardingRelanceScheduler {
  /**
   * Planifie les 3 jobs delayed (3d, 7d, 14d depuis verifiedAt).
   * Idempotent : re-planification = no-op grâce au jobId déterministe.
   */
  planifierRelances(input: PlanifierRelancesInput): Promise<void>;

  /**
   * Annule toutes les relances planifiées d'un profil (transition 'pret').
   * Idempotent.
   */
  annulerRelances(profileId: string): Promise<void>;
}

export const ONBOARDING_RELANCE_SCHEDULER = Symbol.for('OnboardingRelanceScheduler');

/** Mapping étape → délai en ms depuis verifiedAt (réutilisé par les tests). */
export const ETAPE_DELAY_MS: Record<OnboardingRelanceEtape, number> = {
  j3: 3 * 24 * 60 * 60 * 1000,
  j7: 7 * 24 * 60 * 60 * 1000,
  j14: 14 * 24 * 60 * 60 * 1000,
};
