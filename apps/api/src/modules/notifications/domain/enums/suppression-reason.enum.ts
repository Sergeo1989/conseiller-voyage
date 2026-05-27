// T037 — Enum SuppressionReason (mappé sur l'enum Prisma).

export const SuppressionReasonValues = [
  'hard_bounce',
  'soft_bounce_repeated',
  'complaint',
  'manual',
] as const;

export type SuppressionReason = (typeof SuppressionReasonValues)[number];

const PERMANENT_REASONS: ReadonlySet<SuppressionReason> = new Set<SuppressionReason>([
  'hard_bounce',
  'complaint',
  'manual',
]);

export function isPermanentReason(reason: SuppressionReason): boolean {
  return PERMANENT_REASONS.has(reason);
}
