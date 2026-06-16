// T026 [017] — Port VoyageurNotificationMetricsRecorder (observabilité, Principe VII).
// Compte enqueued / sent / failed / cancelled par type — signal de santé du flux
// de notification voyageur (taux d'échec SES, ré-engagement SC-007/009).

import type { VoyageurNotificationType } from '@cv/shared/intake';

export interface VoyageurNotificationMetricsRecorder {
  recordEnqueued(type: VoyageurNotificationType): void;
  recordSent(type: VoyageurNotificationType): void;
  recordFailed(type: VoyageurNotificationType, reason: string): void;
  recordCancelled(count: number): void;
}

export const VOYAGEUR_NOTIFICATION_METRICS_RECORDER = Symbol.for(
  'VoyageurNotificationMetricsRecorder',
);

/** No-op sûr (tests/fakes). */
export const noopVoyageurNotificationMetricsRecorder: VoyageurNotificationMetricsRecorder = {
  recordEnqueued: () => {},
  recordSent: () => {},
  recordFailed: () => {},
  recordCancelled: () => {},
};
