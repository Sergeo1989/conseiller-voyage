// T026 [017] — OtelVoyageurNotificationMetricsRecorder : adapter OpenTelemetry.
// Meter `cv.intake.voyageur_notification`. No-op sûr sans MeterProvider (dev).

import type { VoyageurNotificationType } from '@cv/shared/intake';
import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import type { VoyageurNotificationMetricsRecorder } from '../application/ports/voyageur-notification-metrics-recorder.port';

const meter = metrics.getMeter('cv.intake.voyageur_notification', '1.0.0');

const enqueuedCounter = meter.createCounter('cv.intake.voyageur_notification.enqueued', {
  description: 'Notifications voyageur mises en file, par type',
  unit: '1',
});
const sentCounter = meter.createCounter('cv.intake.voyageur_notification.sent', {
  description: 'Notifications voyageur envoyées, par type',
  unit: '1',
});
const failedCounter = meter.createCounter('cv.intake.voyageur_notification.failed', {
  description: 'Échecs d’envoi (SES HS / sans adresse), par type + cause',
  unit: '1',
});
const cancelledCounter = meter.createCounter('cv.intake.voyageur_notification.cancelled', {
  description: 'Notifications annulées (cascade Loi 25)',
  unit: '1',
});

@Injectable()
export class OtelVoyageurNotificationMetricsRecorder
  implements VoyageurNotificationMetricsRecorder
{
  recordEnqueued(type: VoyageurNotificationType): void {
    enqueuedCounter.add(1, { type });
  }
  recordSent(type: VoyageurNotificationType): void {
    sentCounter.add(1, { type });
  }
  recordFailed(type: VoyageurNotificationType, reason: string): void {
    failedCounter.add(1, { type, reason });
  }
  recordCancelled(count: number): void {
    if (count > 0) cancelledCounter.add(count);
  }
}
