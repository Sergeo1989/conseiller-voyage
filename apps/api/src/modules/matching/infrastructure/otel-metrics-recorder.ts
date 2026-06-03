// T086 — OtelMetricsRecorder : adapter OpenTelemetry du port MetricsRecorder.
//
// Les instruments sont créés une fois (meter `cv.matching`) et exportés
// par l'instance OTel configurée dans `apps/api/src/common/observability/
// otel.ts` (ADR-0003 Grafana Cloud Canada). En l'absence de MeterProvider
// enregistré, l'API `@opentelemetry/api` renvoie des instruments no-op —
// donc safe en dev sans observabilité (même pattern que legal-metrics.ts).

import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import type {
  MatchingComputedMetric,
  MetricsRecorder,
} from '../application/ports/metrics-recorder.port';

const meter = metrics.getMeter('cv.matching', '1.0.0');

const matchedCountCounter = meter.createCounter('matching.matched_count', {
  description: 'Nombre de matchings calculés, labelé par status (ok|partial|empty)',
  unit: '1',
});

const durationHistogram = meter.createHistogram('matching.duration_ms', {
  description: 'Latence calcul + persistance du matching',
  unit: 'ms',
});

const boostAppliedCounter = meter.createCounter('matching.boost_applied', {
  description: 'Nombre de matchings dont le top 3 a bénéficié du boost cookie cv_suggested',
  unit: '1',
});

const candidatesGauge = meter.createGauge('matching.candidates_evaluated', {
  description: 'Nombre de conseillers verified évalués lors du dernier matching',
  unit: '1',
});

@Injectable()
export class OtelMetricsRecorder implements MetricsRecorder {
  recordMatchingComputed(metric: MatchingComputedMetric): void {
    matchedCountCounter.add(1, { status: metric.status });
    durationHistogram.record(metric.durationMs, { status: metric.status });
    candidatesGauge.record(metric.candidatesEvaluated, { status: metric.status });
    if (metric.boostApplied) {
      boostAppliedCounter.add(1, { status: metric.status });
    }
  }
}
