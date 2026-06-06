// T054 — Port LeadMetricsRecorder (observabilité Principe VII, R9).
//
// La couche application émet des intentions de mesure ; l'adapter infra
// (OtelLeadMetricsRecorder) les traduit en counters OTel exportés vers Grafana
// Cloud Canada (ADR-0003). Alimente 2 des 4 métriques de la boucle économique
// (% leads acceptés, conversion lead → devis → réservation).
//
// Instruments (meter `cv.matching.lead`) :
//   - counter cv.matching.lead.created
//   - counter cv.matching.lead.transition           labelé to_state
//   - counter cv.matching.lead.notification_sent
//   - counter cv.matching.lead.notification_failed

import type { LeadState } from '@cv/shared/matching';

export interface LeadMetricsRecorder {
  recordLeadCreated(): void;
  recordLeadTransition(toState: LeadState): void;
  recordNotificationSent(): void;
  recordNotificationFailed(): void;
}

export const LEAD_METRICS_RECORDER = Symbol.for('LeadMetricsRecorder');

/** No-op par défaut (tests unitaires, scripts) — garde l'application découplée d'OTel. */
export const noopLeadMetricsRecorder: LeadMetricsRecorder = {
  recordLeadCreated: () => {},
  recordLeadTransition: () => {},
  recordNotificationSent: () => {},
  recordNotificationFailed: () => {},
};
