// T036 — Enum NotificationStatus (mappé sur l'enum Prisma).
//
// Transitions autorisées (cf. data-model.md invariant 4) :
//   queued → sent → delivered
//                 ↓
//                 → bounced
//                 → complained
//   queued → failed → queued (retry)
//   queued → failed → dead_letter (5 attempts)
//   queued → skipped_suppressed
//   queued → cancelled_erased
//   queued → rendering_failed

export const NotificationStatusValues = [
  'queued',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
  'dead_letter',
  'skipped_suppressed',
  'cancelled_erased',
  'rendering_failed',
] as const;

export type NotificationStatus = (typeof NotificationStatusValues)[number];

const TERMINAL_STATUSES: ReadonlySet<NotificationStatus> = new Set<NotificationStatus>([
  'delivered',
  'bounced',
  'complained',
  'dead_letter',
  'skipped_suppressed',
  'cancelled_erased',
  'rendering_failed',
]);

export function isTerminalStatus(status: NotificationStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
