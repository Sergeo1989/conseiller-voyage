// T054 — OtelLeadMetricsRecorder : adapter OpenTelemetry du port
// LeadMetricsRecorder. Instruments créés une fois (meter `cv.matching.lead`).
// En l'absence de MeterProvider, l'API renvoie des instruments no-op (safe dev).

import type { LeadState } from '@cv/shared/matching';
import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import type { LeadMetricsRecorder } from '../application/ports/lead-metrics-recorder.port';

const meter = metrics.getMeter('cv.matching.lead', '1.0.0');

const createdCounter = meter.createCounter('cv.matching.lead.created', {
  description: 'Nombre de leads créés',
  unit: '1',
});

const transitionCounter = meter.createCounter('cv.matching.lead.transition', {
  description: 'Transitions de lead, labelées par état cible (to_state)',
  unit: '1',
});

const notificationSentCounter = meter.createCounter('cv.matching.lead.notification_sent', {
  description: 'Notifications conseiller envoyées avec succès',
  unit: '1',
});

const notificationFailedCounter = meter.createCounter('cv.matching.lead.notification_failed', {
  description: 'Notifications conseiller en échec',
  unit: '1',
});

@Injectable()
export class OtelLeadMetricsRecorder implements LeadMetricsRecorder {
  recordLeadCreated(): void {
    createdCounter.add(1);
  }
  recordLeadTransition(toState: LeadState): void {
    transitionCounter.add(1, { to_state: toState });
  }
  recordNotificationSent(): void {
    notificationSentCounter.add(1);
  }
  recordNotificationFailed(): void {
    notificationFailedCounter.add(1);
  }
}
