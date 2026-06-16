// T029 [016 US3] — Port EnrichmentMetricsRecorder (observabilité, Principe VII).
// Surveille notamment le taux de repli (mode dégradé) — signal de panne fournisseur.

import type { EnrichmentFailureReason, EnrichmentStatus } from '@cv/shared/intake';

export interface EnrichmentMetricSample {
  readonly status: EnrichmentStatus;
  readonly failureReason: EnrichmentFailureReason | null;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface EnrichmentMetricsRecorder {
  record(sample: EnrichmentMetricSample): void;
}

export const ENRICHMENT_METRICS_RECORDER = Symbol.for('EnrichmentMetricsRecorder');
