// T086 — Port MetricsRecorder (observabilité Principe VII).
//
// La couche application reste pure : elle ne connaît pas OpenTelemetry.
// Elle émet des intentions de mesure via ce port ; l'adapter infra
// (OtelMetricsRecorder) les traduit en compteurs/histogrammes/gauges
// exportés vers Grafana Cloud Canada (ADR-0003).
//
// 4 instruments alimentés (cf. dashboard docs/dashboards/matching.json) :
//   - counter   matching.matched_count        labelé par status (ok|partial|empty)
//   - histogram matching.duration_ms          latence calcul + persistance
//   - counter   matching.boost_applied        nb de matchings avec boost effectif
//   - gauge     matching.candidates_evaluated dernier nb de candidats évalués

import type { MatchingStatus } from '../../domain/value-objects/matching-status.vo';

export interface MatchingComputedMetric {
  /** Statut final du matching — label du compteur matched_count. */
  readonly status: MatchingStatus;
  /** Durée calcul + persistance en millisecondes (histogram). */
  readonly durationMs: number;
  /** Nb de candidats verified évalués (gauge). */
  readonly candidatesEvaluated: number;
  /** Vrai si au moins une entrée du top 3 a bénéficié du boost cookie. */
  readonly boostApplied: boolean;
}

export interface MetricsRecorder {
  /** Enregistre les métriques d'un cycle de matching abouti (non-replay). */
  recordMatchingComputed(metric: MatchingComputedMetric): void;
}

export const MATCHING_METRICS_RECORDER = Symbol.for('MatchingMetricsRecorder');

/**
 * Implémentation no-op — défaut quand aucun adapter n'est branché
 * (tests unitaires sans assertion métrique, scripts CLI). Garde la
 * couche application découplée d'OTel.
 */
export const noopMetricsRecorder: MetricsRecorder = {
  recordMatchingComputed: () => {},
};
