// T097-T102 — Instruments OTel pour le module notifications.
// Singleton au niveau module : importé par les use cases et services.
// Cardinality bornée ≤ 150 séries (15 templates × 2 locales × 5 modules).

import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('cv.notifications', '1.0.0');

/** notification_email_sent_total — labels : template_id, locale, source_module */
export const emailSentCounter = meter.createCounter('notification_email_sent_total', {
  description: 'Total emails acceptés par SES (au moment du dépôt).',
});

/** notification_email_delivered_total — confirmé par événement SES Delivery */
export const emailDeliveredCounter = meter.createCounter('notification_email_delivered_total', {
  description: 'Total emails confirmés délivrés par SES via SNS.',
});

/** notification_email_bounced_total — label : bounce_type (permanent|transient|undetermined) */
export const emailBouncedCounter = meter.createCounter('notification_email_bounced_total', {
  description: 'Total bounces enregistrés via SNS.',
});

/** notification_email_complained_total */
export const emailComplainedCounter = meter.createCounter('notification_email_complained_total', {
  description: 'Total plaintes enregistrées via SNS (feedback loop ISP).',
});

/** notification_email_send_duration_seconds — du début du job BullMQ à SES accepté */
export const emailSendDurationHistogram = meter.createHistogram(
  'notification_email_send_duration_seconds',
  {
    description: 'Durée du job dispatch (render + SES send) en secondes.',
    unit: 's',
    advice: { explicitBucketBoundaries: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10] },
  },
);

/** notification_email_dlq_size — observable gauge rafraîchie par DlqGaugeRefreshJob */
export const dlqSizeObservableGauge = meter.createObservableGauge('notification_email_dlq_size', {
  description: "Nombre d'emails en dead letter queue.",
});
