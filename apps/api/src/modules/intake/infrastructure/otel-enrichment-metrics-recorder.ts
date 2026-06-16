// T029 [016 US3] — OtelEnrichmentMetricsRecorder : adapter OpenTelemetry.
// Meter `cv.intake.enrichment`. No-op sûr en l'absence de MeterProvider (dev).

import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import type {
  EnrichmentMetricSample,
  EnrichmentMetricsRecorder,
} from '../application/ports/enrichment-metrics-recorder.port';

const meter = metrics.getMeter('cv.intake.enrichment', '1.0.0');

const attemptsCounter = meter.createCounter('cv.intake.enrichment.attempts', {
  description: 'Tentatives d’enrichissement',
  unit: '1',
});
const outcomeCounter = meter.createCounter('cv.intake.enrichment.outcome', {
  description: 'Issues labelées par statut + cause de repli (mode dégradé)',
  unit: '1',
});
const latencyHistogram = meter.createHistogram('cv.intake.enrichment.latency_ms', {
  description: 'Latence de l’enrichissement',
  unit: 'ms',
});
const tokensCounter = meter.createCounter('cv.intake.enrichment.tokens', {
  description: 'Tokens LLM consommés (entrée + sortie)',
  unit: '1',
});

@Injectable()
export class OtelEnrichmentMetricsRecorder implements EnrichmentMetricsRecorder {
  record(sample: EnrichmentMetricSample): void {
    attemptsCounter.add(1);
    outcomeCounter.add(1, {
      status: sample.status,
      failure_reason: sample.failureReason ?? 'none',
    });
    latencyHistogram.record(sample.latencyMs);
    const total = sample.inputTokens + sample.outputTokens;
    if (total > 0) tokensCounter.add(total);
  }
}
